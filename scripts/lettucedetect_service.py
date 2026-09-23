#!/usr/bin/env python3
"""
LettuceDetect Service Runner
Uses KRLabsOrg/LettuceDetect ModernBERT-based span-level hallucination detection
"""

import sys
import json
import os

def run_detector(context, question, answer):
    try:
        from lettucedetect.models.inference import HallucinationDetector
    except ImportError as e:
        return {
            "success": False,
            "error": f"lettucedetect not installed: {e}",
            "spans": []
        }

    try:
        # Check if TinyLettuce or standard ModernBERT model is specified
        model_name = os.environ.get("LETTUCEDETECT_MODEL", "KRLabsOrg/lettucedect-base-modernbert-en-v1")
        detector = HallucinationDetector(
            method="transformer",
            model_path=model_name
        )

        predictions = detector.predict(
            context=context if isinstance(context, list) else [context],
            question=question,
            answer=answer,
            output_format="spans"
        )

        # Normalize spans output
        spans = []
        if isinstance(predictions, list):
            for item in predictions:
                if isinstance(item, dict):
                    spans.append({
                        "start": item.get("start", 0),
                        "end": item.get("end", 0),
                        "text": item.get("text", answer[item.get("start", 0):item.get("end", 0)]),
                        "confidence": float(item.get("confidence", 0.95))
                    })
                elif isinstance(item, (list, tuple)) and len(item) >= 2:
                    start, end = int(item[0]), int(item[1])
                    spans.append({
                        "start": start,
                        "end": end,
                        "text": answer[start:end],
                        "confidence": 0.95
                    })

        return {
            "success": True,
            "spans": spans,
            "model": model_name
        }
    except Exception as ex:
        return {
            "success": False,
            "error": str(ex),
            "spans": []
        }

def main():
    try:
        raw_input = sys.stdin.read().strip()
        if not raw_input:
            if len(sys.argv) > 1:
                raw_input = sys.argv[1]
            else:
                print(json.dumps({"success": False, "error": "No input provided"}))
                return

        payload = json.loads(raw_input)
        context = payload.get("context", [])
        question = payload.get("question", "")
        answer = payload.get("answer", "")

        result = run_detector(context, question, answer)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    main()
