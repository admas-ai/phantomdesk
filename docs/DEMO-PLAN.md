# Finished demonstration — 1:54 edited walkthrough

Updated November 28, 2026. The final `phantomdesk-demo-v1.mp4` is a 114-second narrated walkthrough assembled from actual captures of the working app, its browser-check page, and the public Kiro attribution document. It uses synthetic records throughout. The persistent on-screen description is **“Edited walkthrough · actual app captures · synthetic data.”** It is an edited sequence of captured states, not a continuous recording of pointer actions.

The story follows a maintenance coordinator preparing a work list: approval belongs to the exact saved instructions that were reviewed. `DEMO-002` provides the main sequence, from missing information to an approved revision, changed instructions, a blocked stale export, renewed approval, and a later duplicate review condition.

## Final edit

| Time | Captured evidence and narration |
| --- | --- |
| 0:00–0:14.464 | The review desk and intact revision-3 seal introduce the approval-to-revision rule. |
| 0:14.464–0:18.048 | The original missing-unit request shows its incomplete state. |
| 0:18.048–0:25.484 | Unit `3`, saved instructions, and the actual revision-3 approval seal are visible. |
| 0:25.484–0:31.799 | The approved export preview is followed by the actual changed instructions saved in revision `4`. |
| 0:31.799–0:40.944 | The broken seal and the actual stale-download rejection are shown, including a readable close-up of the error. |
| 0:40.944–0:49.798 | The implemented inspector compares preserved approved revision `3` with current saved revision `4`; changed instructions and unchanged fields remain visible. |
| 0:49.798–0:54.364 | A segment explicitly labeled **“Separate inspector check · unsaved draft”** shows the saved-revision-11 QA state and the notice separating the draft from the saved comparison. It is not presented as the next revision in the main sequence. |
| 0:54.364–1:03.936 | **“Main walkthrough · approved revision 5”** resumes the main sequence. The actual revision-5 approval and refreshed CSV preview are shown. The downloaded CSV was independently read and matched to the saved instructions, revision and approval timestamp. |
| 1:03.936–1:14.969 | The real later matching request and unresolved duplicate condition remain in view. The sentence about a third request is labeled as a tested pair-specific rule; no third-request action or screen is invented. |
| 1:14.969–1:22.156 | The app accompanies the JavaScript/IndexedDB architecture explanation and the original Codex attribution. |
| 1:22.156–1:35.826 | A capture of the public `KIRO-USAGE.md` attribution table identifies Kiro CLI’s comparison helper, historical selector, styles and tests, followed by the independent Codex corrections. |
| 1:35.826–1:40.135 | The actual browser-check page displays **9 passed, 0 failed**. |
| 1:40.135–1:45.341 | The prototype’s device-local storage and unauthenticated reviewer labels are stated. The app’s actual reviewer-label explanation is shown. |
| 1:45.341–1:54 | The broken seal, preserved comparison and desk close the approval-to-revision story. The original narration ends at about 1:52; the final image holds with approximately two seconds of added silence. |

## Media and attribution

The edit uses 26 shots drawn from 11 actual CUA captures. Screenshots are uniformly scaled or explicitly cropped; explanatory headings and captions sit outside the captured UI. No app screens, buttons, action results or pointer motions were synthesized. The Kiro attribution segment uses the real public document and distinguishes the original Codex prototype, Kiro’s observed contribution, and the subsequent independent corrections. The earlier authentication and unimplemented-feature contingencies no longer describe this finished edit; [KIRO-USAGE.md](KIRO-USAGE.md) records the completed contribution.

English narration was generated once with HeyGen’s **Annie – Lifelike** voice. The supplied master is **112.002971 seconds** and is retained at **1× speed**, without cutting or stretching speech. The edit adds **1.997029 seconds** of trailing silence. There is no music. The 43 subtitle cues cover all 289 supplied word tokens and preserve the script’s punctuation using the returned word and character timings. The exact used SRT is [demo-narration.srt](evidence/demo-narration.srt).

The actual downloaded [revision-5 CSV](evidence/approved-revision-2026-11-28.csv) contains `DEMO-002`, approved revision `5`, the instructions **“Tighten the cupboard hinges. Do not replace the door.”**, and approval time `2026-11-28T06:48:02.361Z`. The video shows the real export preview while discussing that verified file; it does not substitute an invented spreadsheet view.

## What was verified

- Final duration: **114.000 seconds**, below 180 seconds; **1920 × 1080**, **24 fps**, **2,736 frames**, H.264/yuv420p with AAC mono audio at 48 kHz. The MP4 is **5,500,994 bytes**.
- The complete encoded video and audio decoded successfully with FFmpeg. Thirty-four representative encoded frames were visually inspected, covering every shot, both cuts into and out of the separately labeled inspector check, the last caption and the silent ending. The sampled compositions match the intended actual-capture layouts. No caption clipping, obstruction of the demonstrated evidence, unintended blank frame or distorted screenshot was observed in those samples.
- The full-size stale-download error, saved comparison and unsaved-draft notice were inspected for readability. Captions occupy a separate bottom band and use at most two lines.
- Audio signal checks found nonzero audio, a peak of **−0.227 dBFS**, RMS of **−17.593 dBFS**, and **zero clipped samples**. Opening, middle and final-speech source/output correlations exceed **0.99997** at zero time offset. Silence detection found short natural pauses and the intended ending; the full source-length speech interval remains present.
- Subtitle text and punctuation match the supplied script, and all 289 words are covered once. One 5.63-second cue measures 20.07 characters per second; it remains a readable two-line cue in the inspected frame.

**Listening review was not performed.** Signal, timing and correlation checks establish that audio is present and preserved, but do not establish pronunciation, pacing, naturalness or perceptual audio quality. This document also does not claim the video has already been uploaded, made public, or accepted as a contest entry. Publishing status is maintained separately.

## Reproducibility and evidence

The renderer is [tools/render-demo.py](../tools/render-demo.py). It accepts a manifest containing the original audio, an explicit duration, contiguous image clips, optional source-pixel crops, headings and the supplied SRT. It preserves narration speed, adds only the explicitly authorized silent tail, records asset hashes and render commands, and performs a complete decode after rendering.

The repository includes a [relative-path edit manifest](evidence/demo-manifest-v1.json), [media provenance and source hashes](evidence/demo-provenance.json), [final technical and visual QA record](evidence/demo-finalqa.json), and the exact subtitle file. Original media paths in the manifest refer to the production bundle; large input media and the final MP4 are not duplicated in this evidence folder. Restoring the original media at those relative paths allows the edit to be rendered with the same script.

Final MP4 SHA-256: `bf6a6c64494bf6fcda2d78f8452eb534c7a478406183678d45e581f33c851698`.

Renderer SHA-256: `44aa6891392baefcbbe40f197768a71106051f9db0e4e26d8e86d4559fb966a0`.
