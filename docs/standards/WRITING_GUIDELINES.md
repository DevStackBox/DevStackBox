# DevStackBox Writing Guidelines

Product-wide rules for UI, installer, documentation, release notes, and changelog.

See also: [TERMINOLOGY.md](TERMINOLOGY.md), [UI_GUIDELINES.md](UI_GUIDELINES.md).

---

## Voice

DevStackBox communicates like a professional developer tool.

Writing should be:

- Clear
- Direct
- Calm
- Helpful
- Concise

Avoid:

- Marketing exaggeration
- Corporate jargon
- AI-style wording (`Executing cleanup task...`, `Beginning service termination...`)
- Humor inside system messages
- Excessive punctuation

Target tone: VS Code, Windows Terminal, JetBrains, Visual Studio.

---

## Don't apologize

State facts. Do not apologize in errors or system messages.

| Avoid                        | Use                     |
| ---------------------------- | ----------------------- |
| Sorry, something went wrong. | Unable to start Apache. |
| Sorry, backup failed.        | Backup failed.          |

---

## Terminology

Use one vocabulary. See [TERMINOLOGY.md](TERMINOLOGY.md) for the full glossary.

---

## Capitalization

| Context      | Style           | Examples                                       |
| ------------ | --------------- | ---------------------------------------------- |
| Navigation   | Title Case      | Dashboard, Services, Settings                  |
| Card titles  | Title Case      | Apache, PHP Versions, Virtual Hosts            |
| Descriptions | Sentence case   | Manage Apache configuration and virtual hosts. |
| Buttons      | Title Case verb | Start, Stop, Refresh                           |

---

## Buttons

Always verbs:

`Start` | `Stop` | `Restart` | `Install` | `Update` | `Refresh` | `Browse` | `Open` | `Save` | `Restore` | `Delete` | `Cancel`

Never: `Do Start`, `Run Service`, `Execute`, `Proceed`.

Button variants: [UI_GUIDELINES.md](UI_GUIDELINES.md).

---

## Confirmation dialogs

```
Title:    Delete Database
Body:     This action permanently deletes the database.
Buttons:  Delete | Cancel
```

Not: `Are you sure?` as the title.

---

## Toasts

Past tense, short, no "successfully":

```
Apache started.
Configuration saved.
Backup completed.
```

---

## Errors

Three parts - always actionable:

1. What failed
2. Why
3. What to do

Example:

```
Unable to start Apache.

Port 80 is already in use.

Stop the application using port 80 or change the Apache port.
```

Not: `Operation failed.`

---

## Empty states

```
No databases found.

Create a database to get started.
```

Not: `Nothing here`.

---

## Status vocabulary

Use one set everywhere:

`Running` | `Stopped` | `Starting` | `Stopping` | `Installing` | `Updating` | `Downloading` | `Ready` | `Completed` | `Failed`

Do not mix: `Done`, `Finished`, `Complete`, `Succeeded`.

Prefer structured layout:

```
Apache
Running
```

or `Status: Running` - not `Apache -> Running`.

---

## Numbers

```
5 databases
1 database
```

Never: `5 Database(s)`.

---

## Time

```
Just now
2 minutes ago
1 hour ago
Yesterday
```

Do not mix: `a moment ago`, `secs ago`, `few seconds ago`.

---

## Punctuation and icons

- In-progress: three dots - `Checking for Updates...`
- Completed: period - `Apache stopped.`
- No emoji in product UI or project docs
- No Unicode decorative symbols in text - use Lucide icons in the app UI
- Do not replace selection indicators with the word `Selected`

---

## Installer and uninstaller progress log

Human, Visual Studio-style. Not verbose.

```
Stopping Apache...
Apache stopped.

Stopping MySQL...
MySQL stopped.

Removing application files...
Removing shortcuts...
Removing registry entries...
Removing user data...

Completed.
```

Branded component names in logs: `Apache`, `MySQL`, `PHP`, `phpMyAdmin`.

---

## Scope

These rules apply to: app UI, README, installer/uninstaller, docs, release notes, and changelog.
