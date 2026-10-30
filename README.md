<p align="center"><img src="icons/icon128.png" width="96" alt="WebLab Downloader logo"></p>

# WebLab Downloader for TU Delft

A browser extension that downloads folders from [WebLab](https://weblab.tudelft.nl) (past exams, practice questions, exercises) as Markdown files in one zip. Upload the result to Claude, ChatGPT or another AI tool to study, practise or look for patterns across exams.

It can also **reset your answers** in a whole folder at once, so you can redo a practice exam from scratch without clicking Reset on every question.

> **Unofficial.** This is a student project. It is not made, endorsed or supported by TU Delft or the WebLab team.

## What you get

Pick one or more folders, and you get a zip with:

| File | What it is |
| --- | --- |
| `ALL_CONTENT.md` | Everything you picked in one file. **This is the one to upload to an AI.** |
| One `.md` per exam/section | The same content, split up, if you only want one exam. |
| `images/` | Figures from the questions. Upload them together with the Markdown when a question has a figure. Turn off **Include images** to skip them. |

Upload the `.md` file itself rather than the whole zip. Not every AI tool accepts zips, and those that do often only skim parts of the files inside.

Every question includes its full folder path (e.g. `Exam Practice › Old Endterm Exam (04-11-2025) › Unix I`), the question text, options or code, and the correct answer when WebLab shows one:

- a **model answer** published by the teacher, or
- for multiple choice you already submitted, the **correct option and explanation** WebLab shows afterwards.

## Options

Two checkboxes in the popup decide what goes in the download. Click the ⓘ next to each one for a quick explanation.

| Option | On | Off |
| --- | --- | --- |
| **Include my answers** | Also adds what you answered, with WebLab's ✓/✗ | Question and model answer only |
| **Include images** (on by default) | Figures are saved in `images/` | Text only, figures are left out |

The popup remembers your choices.

## Reset answers (redo a practice exam)

Under **Download** there's a second button, **Reset answers**. It clears your answers in every question inside the folders you ticked, the same as opening each question, clicking **Re-open your submission**, then **Reset**.

1. Tick the folders or questions you want to redo.
2. Click **Reset answers**.
3. A red pop-up lists exactly what will be reset. Click **Yes, reset answers** to go ahead, or **Cancel**.
4. Keep the tab open until the box in the corner says **Done**, then reload the page.

What happens per question type:

| Question type | What reset does |
| --- | --- |
| Multiple choice | Clears your selected options (WebLab's own Reset) |
| Written / essay | Empties your answer and saves it |
| Programming | Restores the starting template (WebLab's own Reset). WebLab keeps your old code in comments at the bottom |

Good to know:

- **It can't be undone.** Click **Download** first with **Include my answers** on if you want to keep a copy.
- WebLab keeps showing questions as *started* or *completed* after a reset. That status is WebLab's own and can't be cleared, but your answers are gone.
- Questions that were already empty are counted as *already empty*. Anything that couldn't be reset (for example a closed question) is listed at the end.
- Ticking a whole practice exam also resets questions like "Code of Honour" or "Feedback". Tick only the questions folder if you want to keep those.

## Install

1. Open **[WebLab Downloader in the Chrome Web Store](https://chromewebstore.google.com/detail/WebLab%20Downloader/kfjoehghihjmpgmdelopjkmkonaobejg)**.
2. Click **Add to Chrome**, then **Add extension**.
3. Pin the extension with the puzzle-piece icon in the toolbar.

Also works in **Edge, Brave, Arc, Vivaldi and Opera**, which can install from the Chrome Web Store too (in Edge, click **Allow extensions from other stores** when asked).

Firefox and Safari are not supported.

Updates install automatically.

<details>
<summary>Install from source instead</summary>

1. On this page, click **Code → Download ZIP** and unzip it.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the unzipped folder (the one containing `manifest.json`).

To update: download the ZIP again, replace the folder, and click ↻ on the extension in `chrome://extensions`.

</details>
## Use

1. Log in to WebLab and open any page **inside a course** (not the WebLab home page).
2. Click the extension. You'll see the course's folders; the folder you're on is already ticked. Click › to look inside a folder, and tick everything you want. Ticking a folder includes everything in it.
3. Check the **Will download** list, then press **Download**.
4. Keep the tab open until the box in the corner says **Done**. It loads one page at a time, about three per second, so a full exam takes a minute or two.

**Troubleshooting**

- *"Open a course first"*: you're on the WebLab home page or your profile. Click one of your courses, then open the extension again.
- *The folder list doesn't appear*: reload the WebLab page and try again.
- *"You're logged out of WebLab"* or *"Couldn't reach WebLab"*: your session expired or your internet dropped. Log in again (reload the page), then start the download again.

## Privacy and safety

- It only works on `weblab.tudelft.nl` and runs inside your own browser, using your existing WebLab login. It never sees your password.
- **Download** only reads pages. It never submits answers, posts comments or changes anything.
- **Reset answers** is the only thing that changes anything on WebLab, and only after you confirm the red pop-up. It clears your own answers in the folders you picked, using WebLab's own Reset and Save buttons. It never submits, marks anything completed, posts comments or touches anyone else's work.
- It **never unlocks** locked answers (WebLab shows course staff when you unlock one). Locked answers are skipped.
- Nothing is sent anywhere else. The zip is built on your computer.
- It can only see and change what your account can already see and change.
- It's deliberately gentle on WebLab:
  - one request at a time, at most about three per second, and one per second when resetting
  - only one download or reset at a time, even across several WebLab tabs
  - a 30-second wait between resets
  - folders are only loaded when you open them, and remembered for 30 minutes
  - it stops for a minute if WebLab reports it's busy (in every tab), and stops a reset after three errors in a row

## Please use it responsibly

Exam questions are the course staff's work. Use downloads for your own studying and don't post them publicly.

**Never use it during an exam.** Only download or reset past exams and practice material, not an exam that is currently running.

## Limitations

- Built and tested on a few CSE courses. Other courses may use question types it doesn't handle yet.
- If WebLab changes its pages, parts of the extension may stop working until it's updated.
- Correct answers for multiple choice only appear after you've submitted the question, or when a teacher published a model answer.
- Reset has been tested on multiple choice, written and programming questions. Other question types may be listed as "not reset".

## Contributing

Bug reports and pull requests are welcome, but this is maintained in spare time, so there are no guarantees.

## License

[MIT](LICENSE): free to use, change and share, provided as is, without warranty.

The license covers this extension's code only. WebLab is TU Delft's platform, and everything on it (questions, exams, model answers) belongs to TU Delft and the course staff. Downloading it with this tool doesn't change that.
