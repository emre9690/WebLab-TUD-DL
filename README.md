<p align="center"><img src="icons/icon128.png" width="96" alt="WebLab Downloader logo"></p>

# WebLab Downloader for TU Delft

A browser extension that downloads folders from [WebLab](https://weblab.tudelft.nl) (past exams, practice questions, exercises) as Markdown files in one zip. Upload the result to Claude, ChatGPT or another AI tool to study, practise or look for patterns across exams.

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

## Install

It isn't in the Chrome Web Store (yet), so you install it by hand. This takes about a minute.

1. On this page, click **Code → Download ZIP** and unzip it.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the unzipped folder (the one containing `manifest.json`).
5. Pin the extension with the puzzle-piece icon in the toolbar.

Also works in **Edge, Brave, Arc, Vivaldi and Opera** (use their own extensions page, e.g. `edge://extensions`). Firefox and Safari are not supported.

To update: download the ZIP again, replace the folder, and click ↻ on the extension in `chrome://extensions`.

## Use

1. Log in to WebLab and open any page **inside a course** (not the WebLab home page).
2. Click the extension. You'll see the course's folders; the folder you're on is already ticked. Click › to look inside a folder, and tick everything you want. Ticking a folder includes everything in it.
3. Check the **Will download** list, then press **Download**.
4. Keep the tab open until the box in the corner says **Done**. It loads one page about every 0.3 seconds, so a full exam takes a minute or two.

**Troubleshooting**

- *"Open a course first"*: you're on the WebLab home page or your profile. Click one of your courses, then open the extension again.
- *The folder list doesn't appear*: reload the WebLab page and try again.

## Privacy and safety

- It only works on `weblab.tudelft.nl` and runs inside your own browser, using your existing WebLab login. It never sees your password.
- It only **reads** pages. It never submits answers, posts comments or changes anything.
- It **never unlocks** locked answers (WebLab shows course staff when you unlock one). Locked answers are skipped.
- Nothing is sent anywhere. The zip is built on your computer.
- It can only download what your account can already see.

## Please use it responsibly

Exam questions are the course staff's work. Use downloads for your own studying and don't post them publicly.

## Limitations

- Built and tested on a few CSE courses. Other courses may use question types it doesn't handle yet.
- If WebLab changes its pages, parts of the extension may stop working until it's updated.
- Correct answers for multiple choice only appear after you've submitted the question, or when a teacher published a model answer.

## Contributing

Bug reports and pull requests are welcome, but this is maintained in spare time, so there are no guarantees.

## License

[MIT](LICENSE): free to use, change and share, provided as is, without warranty.

The license covers this extension's code only. WebLab is TU Delft's platform, and everything on it (questions, exams, model answers) belongs to TU Delft and the course staff. Downloading it with this tool doesn't change that.
