# Privacy Policy: WebLab Downloader (Unofficial)

Last updated: 31 October 2026

WebLab Downloader is an unofficial browser extension that downloads folders from TU Delft's WebLab (`weblab.tudelft.nl`) as Markdown files, and can reset your own answers in a folder so you can redo practice exams. It is not made, endorsed or supported by TU Delft or the WebLab team.

## Summary

The extension does not collect, send, sell or share any data. Everything happens inside your own browser.

## What the extension accesses

- **WebLab pages you choose to download.** When you press Download, the extension reads the WebLab pages in the folders you selected (questions, folder listings and published answers), using your existing WebLab login. It turns them into Markdown files and saves them as a zip on your computer.
- **Your answers, when you choose Reset answers.** Only after you confirm, the extension clears your own answers in the questions you selected, by using WebLab's own Reset and Save buttons with your existing login. Nothing is sent anywhere except to WebLab itself, the same as if you clicked those buttons by hand.
- **Your WebLab login.** The extension never sees your password. Your browser sends its existing WebLab session with each page request, the same way it does when you click around WebLab yourself.

It only works on `weblab.tudelft.nl`. It does not read any other website.

## What the extension stores

- Your two settings ("Include my answers" and "Include images"), saved with the browser's extension storage so the popup remembers them.
- The names and links of WebLab folders you open in the popup, kept for up to 30 minutes in the browser's temporary session memory so the same folders aren't requested from WebLab again. This is never written to disk and is cleared when you close the browser.
- Two timestamps in WebLab's own site storage in your browser: when the extension may next contact WebLab after WebLab reported it was busy, and when the 30-second wait between resets ends. They are only used to limit how fast the extension talks to WebLab.

Nothing else is stored.

## What the extension sends

Nothing to the developer or to anyone else. The extension has no server. The only requests it makes go to WebLab: loading the pages you download and, when you choose Reset answers, WebLab's own reset and save actions for your answers. The downloaded zip is built and saved locally in your browser.

## Third parties

No data is sold, transferred or shared with third parties, and no data is used for advertising, analytics, creditworthiness or lending.

## Your downloads

The files you download stay on your computer and are under your control. If you upload them to an AI tool or anywhere else, that service's own privacy policy applies.

## Changes

If this policy changes, the updated version will be published at this address with a new "Last updated" date.

## Contact

Questions or concerns: open an issue at https://github.com/emre9690/WebLab-TUD-DL/issues
