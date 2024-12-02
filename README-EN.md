<img width="1093" alt="LogoDarkReady" src="https://github.com/user-attachments/assets/d9c3df89-3937-4ba7-b278-c76bb44f14e9#gh-dark-mode-only"><br>
<img width="1093" alt="LogoLightReady" src="https://github.com/user-attachments/assets/7c2e239b-3684-436e-a23c-5ebf85db1ab9#gh-light-mode-only">

### [한국어](https://github.com/WareAoba/Paraglide/blob/main/README-KR.md)

# Paraglide - Paragraph Processor

 A program designed to automate the process of **sequentially copying each paragraph** from a loaded .TXT file and moving to the **next paragraph upon detecting Ctrl[Cmd] + V input**.

## Overview

 ![Welcome](https://github.com/user-attachments/assets/1a591599-6d0c-4af7-a50b-317eae89adc1)
 ![Comparison](https://github.com/user-attachments/assets/bd0683c2-08a6-47f6-970e-52179b2a7995)
 ![Paste](https://github.com/user-attachments/assets/c59d59a8-f582-4b82-8e9b-85334cffd50f)
 ![AltArrow](https://github.com/user-attachments/assets/c5e3e283-add9-4c46-888e-bba88b496c63)
 ![Sidebar](https://github.com/user-attachments/assets/ec5bdcc4-33a4-4fce-92ea-3a89fa289701)

## Key Features

 1. Load .TXT files and split paragraphs, displaying **previous/current/next** paragraphs.
 2. Monitor keyboard input and perform **actions based on key combinations**:
   - **Paste (Ctrl + V, Cmd + V)**: Copy the next paragraph.
   - **Alt (Opt) + Arrow Keys (←→)**: Navigate to the previous/next paragraph.
   - **Alt (Opt) + Arrow Keys (↑↓)**: Pause/Resume the program.
 3. Display the **current paragraph in progress** with an overlay window and allow navigation between paragraphs.
 4. Save logs to restore the **last position** when reloading a previously processed file.
 5. Quickly **load previously worked files** within the app.

## Purpose of Development

 Inspired by [SB2Tool](https://github.com/JOWONRO/SB2Tool), this program addresses one major limitation of the original tool: **it was Windows-exclusive**. 

 Despite not being a professional coder, I enthusiastically leveraged GPT to create this program. Written in **JavaScript** (NPM, React, Electron), it works across platforms, making it **more versatile** than the Windows-only predecessor.

 Although the beta version is still under development, the current pace suggests that a release might be possible within this month.

## Project Overview
```
📦 Paraglide
├── 📂 public                         # Static Resources
│   ├── 📂 icons                      # App Icons
│   │   ├── 📂 mac                    # macOS Icons
│   │   └── 📂 win                    # Windows Icons  
│   ├── 📜 index.html                 # Main HTML
│   ├── 📜 manifest.json              # App Manifest
│   └── 📂 UI_icons                   # UI Icons
│
├── 📂 src                            # Source Code
│   ├── 📂 components                 # React Components
│   │   ├── 📜 MainComponent.js       # Main Component
│   │   ├── 📜 OverlayComponent.js    # Overlay Component
│   │   ├── 📜 Settings.js            # Settings Component
│   │   └── 📜 Sidebar.js             # Sidebar Component
│   │
│   ├── 📂 CSS                        # Stylesheets
│   │   ├── 📜 App.css                # App Styles
│   │   ├── 📜 MainComponent.css      # Main Component Styles
│   │   ├── 📜 OverlayComponent.css   # Overlay Styles
│   │   ├── 📜 Settings.css           # Settings Styles
│   │   └── 📜 Sidebar.js             # Sidebar Styles
│   │
│   ├── 📜 App.js                     # React Entry Point
│   ├── 📜 index.css                  # Global Styles
│   ├── 📜 index.js                   # App Entry Point
│   ├── 📜 main.js                    # Electron Main Process
│   └── 📜 SystemListener.js          # System Event Handler
│
├── 📜 LICENSE                        # License File
├── 📜 package.json                   # Project Configuration
├── 📜 README.md                      # Project Documentation
└── 📜 README-KR.md                   # Project Documentation (Korean)
 ```

## Supported Platforms

 - **Windows** (*x64*)
 - **macOS** (*arm64*, M1 and above)
 
 **Coming Soon**: macOS(x86) Linux

## Contribution

 ***Your contributions can enhance the quality of this program!***  

 We deeply appreciate feedback and assistance from talented individuals.  
 Feel free to suggest improvements or highlight areas that need refinement!

## Installation / Execution
 Download the appropriate precompiled binary from the [Release Page](https://github.com/WareAoba/Paraglide/releases).

 - **Windows**:
  - Extract **Paraglide-win32-x64-0.1.0-beta.zip**.
  - Run **Paraglide.exe**.
 
 - **macOS**:

  - Mount **Paraglide-0.1.0-beta-arm64.dmg**.
  - Copy **Paraglide.app** to **~/Applications**.
  - Follow the instructions to enable **accessibility** and **input monitoring** permissions.

## Running in Dev Mode / Building

 ***(Prerequisites: Node.js)***

 **Dev Mode**:

 1. Clone the repository:

   ```bash
   git clone https://github.com/WareAoba/Paraglide
   ```

 2. Switch to the **development** branch:
  
   ```bash
   git checkout -b development
   ```

 3. Install NPM in root directory of the project:

   ```bash
   git clone https://github.com/WareAoba/Paraglide
   ```

 4. Run the program with the following command:
   
   ```bash
   npm run dev
   ```

 **Building and Compiling**:

 - Run the following command to create a build:(**may not have been tested** for compilation.)

  ```bash
  npm run make
  ```

 (For Windows, switch to the **-win32** branch.)


## Recent Updates


1. ***Beta Release***
2. Various bugs have been fixed.
3. Finalized macOS permission checks.
4. [Dev] Introduced Redux for state management.
5. [Dev] Line Mode: Added a mode to process text on a line-by-line basis instead of by paragraphs.
6. [Dev] **List View**: Added a mode that allows viewing all paragraphs by scrolling instead of previous/current paragraphs.
7. [Dev] **Drag & Drop**: You can load files by dragging & dropping.
8. [Dev] **Massive UI Revisions**: Images will be uploaded later.
9. [Dev] Fixed the page number recognition logic that was not working. Also added cases for "Grouped-Page".

## Features in Development

 1. **Search Function**: Search text/paragraphs and jump to the desired paragraph.
 2. Click-to-Jump in the overlay window.
 3. Enhanced Animations: The most challenging part—requires significant rework.
 4. **UI Icons**: From pause/resume buttons to future buttons.defaults, highlight colors, etc.
 5. **User Guide**: A detailed manual to accompany the beta release.
 6. **File Editing**: Simple modifications like renaming files or editing paragraph content.
 7. **Multilingual Support**: Planned to support English and Japanese first.

## Known Issues

 1. **Overlay layout misalignment**: All paragraphs should have equal spacing, but the gaps between previous/current and current/next are unusually wide. I'm currently unsure how to fix this.
 2. **UI properties being migrated to CSS**: Converting all UI properties to CSS is currently making the UI quite messy. It's uncertain when this will be fully resolved.
 3. **New Sidebar design is subpar**: The design of the newly added Sidebar is very poor. Improvements are planned for the future.
 4. **Program size issue**: The current size of the program is quite large. Plans are in place to gradually reduce it.

## Beta Release?

 The ongoing CSS theme implementation is a daunting task and may take a few more days, but essential features should be completed soon. Beta v0.1 is targeted for release by the end of the month.
 If I had coding experience, this would’ve progressed much faster, but tinkering with AI often breaks working features—fixing those takes up most of my time. 😂

## License

 The majority of the code for this program was generated using **GitHub Copilot Chat**.

 The program and its source code are distributed under the **MIT License**.
