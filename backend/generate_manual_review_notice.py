def generate_manual_review_notice(candidate_name: str, ocr_score: int, threshold: int = 60) -> str:
    header = f"AI Decision Breakdown — {candidate_name}\n"
    status = "**Manual Review Required**" if ocr_score < threshold else "**Automated Review OK**"
    lines = [header, status + f"— OCR quality score: **{ocr_score}/100** (threshold: {threshold}/100)", "Automated shortlisting was skipped for this application due to low document scan quality. Please review the uploaded documents and make a manual decision.", "Points to note", "⚠ Your documents have been received. They are being reviewed by our team and you will be notified of the outcome in due course.", "", "HR Notes (internal)", f"Document OCR quality estimated at {ocr_score}/100 (threshold: {threshold}/100). One or more uploaded documents could not be read automatically with sufficient confidence.", "This application has been placed in the HR Manual Review Queue.", "HR can review the documents, then approve (shortlist) or reject this candidate. Please handle this, but don't use OpenRouter API."]
    return "\n".join(lines)


if __name__ == '__main__':
    notice = generate_manual_review_notice('MUKANYAMWASA Marie Maderene', 33, 60)
    print(notice)
