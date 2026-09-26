import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChatPanel } from "@/components/ChatPanel";

jest.mock("@/lib/supabase", () => ({
  getSupabaseClient: jest.fn(() => null),
  fetchChatMessagesFromSupabase: jest.fn(() => Promise.resolve([])),
  saveChatMessageToSupabase: jest.fn(() => Promise.resolve(true)),
}));

describe("ChatPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
  });

  it("renders correctly when chat history is empty", async () => {
    render(<ChatPanel documentId="doc-1" />);

    expect(screen.getByRole("heading", { name: "Grounded Q&A" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Ask a question about this contract" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Hello\. I can answer questions grounded strictly/)).toBeInTheDocument();
    });
  });

  it("renders and expands a citation button when a response includes a citation", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      {
        ok: true,
        json: async () => ({
          answer: "The provider indemnifies the customer.",
          citations: [
            {
              clauseId: "clause-1",
              sectionNumber: "7",
              title: "Indemnification",
              snippet: "Provider shall indemnify Customer.",
            },
          ],
          hallucination: null,
        }),
      }
    );

    render(<ChatPanel documentId="doc-1" />);
    const input = screen.getByRole("textbox", { name: "Ask a question about this contract" });
    fireEvent.change(input, { target: { value: "Who indemnifies the customer?" } });
    fireEvent.submit(input.closest("form")!);

    const citationToggle = await screen.findByRole("button", {
      name: "Toggle citations (1 excerpts)",
    });
    expect(citationToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("7 — Indemnification")).toBeInTheDocument();
    expect(screen.getByText(/Provider shall indemnify Customer/)).toBeInTheDocument();
  });

  it("renders a sanitized API error state instead of crashing or exposing the raw error", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      {
        ok: false,
        json: async () => ({
          message: "All AI services are temporarily unavailable. Please try again shortly.",
          error: "raw provider error: sk-secret-key",
          category: "ALL_PROVIDERS_DOWN",
          requestId: "req-safe-1",
        }),
      }
    );

    render(<ChatPanel documentId="doc-1" />);
    const input = screen.getByRole("textbox", { name: "Ask a question about this contract" });
    fireEvent.change(input, { target: { value: "What is the liability cap?" } });
    fireEvent.submit(input.closest("form")!);

    expect(
      await screen.findByText("All AI services are temporarily unavailable. Please try again shortly.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/sk-secret-key/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry failed query" })).toBeInTheDocument();
  });
});
