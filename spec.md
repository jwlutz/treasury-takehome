- need to extract text from image labels, decide if it's a match with something in db (is the match-against given?)
- 5 second latency
- batch uploads
- government warning required all caps by law
  - everything else is fuzzy match ("judgement")
- image quality grading/rejection system?
- blocked outbound traffic is a constraint to acknowledge

- this is very similar to inventory reconciliation project. we want it to be easy to handle batches and edge cases. need review dashboard

- inputs are going to be given with image. simple go/no go
- model will choose clear, flagged, needs review (if glare, unsure, etc) and needs review should have reason attached
- where am I gonna get test data from?
- auth/scoped roles need to be simulated
- look at actual cola db to see fields?