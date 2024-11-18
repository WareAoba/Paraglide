<img width="1093" alt="LogoDarkReady" src="https://github.com/user-attachments/assets/d9c3df89-3937-4ba7-b278-c76bb44f14e9#gh-dark-mode-only"><br>
<img width="1093" alt="LogoLightReady" src="https://github.com/user-attachments/assets/7c2e239b-3684-436e-a23c-5ebf85db1ab9#gh-light-mode-only">

### [한국어](https://github.com/WareAoba/Paraglide/blob/main/README-KR.md)

# Paraglide - Paragraph Processor

 A program designed to automate the process of **sequentially copying each paragraph** from a loaded .TXT file and moving to the **next paragraph upon detecting Ctrl[Cmd] + V input**.

## Key Features

 1. Load .TXT files and split paragraphs, displaying **previous/current/next** paragraphs.
 2. Monitor keyboard input and perform **actions based on key combinations**:
   - **Paste (Ctrl + V, Cmd + V)**: Copy the next paragraph.
   - **Alt (Opt) + Arrow Keys (←→)**: Navigate to the previous/next paragraph.
   - **Alt (Opt) + Arrow Keys (↑↓)**: Pause/Resume the program.
 3. Display the **current paragraph in progress** with an overlay window and allow navigation between paragraphs.
 4. Save logs to restore the **last position** when reloading a previously processed file.

## Purpose of Development

 Inspired by [SB2Tool](https://github.com/JOWONRO/SB2Tool), this program addresses one major limitation of the original tool: **it was Windows-exclusive**. 

 Despite not being a professional coder, I enthusiastically leveraged GPT to create this program. Written in **JavaScript** (NPM, React, Electron), it works across platforms, making it **more versatile** than the Windows-only predecessor.

 Although the beta version is still under development, the current pace suggests that a release might be possible within this month.

## Project Overview
 📦 Paraglide
 ├── 📂 public/                # Static resources
 │   ├── 📂 icons/            # App icons
 │   ├── 📂 UI_icons/         # UI icons (SVG)
 │   ├── 🖼️ logo-dark.png     # Dark mode logo 
 │   └── 🖼️ logo-light.png    # Light mode logo
 │
 ├── 📂 src/                   # Source code
 │   ├── 📂 components/       # React components
 │   │   ├── 📄 Settings.js   # Settings component
 │   │   └── 📄 Sidebar.js    # Sidebar component
 │   │
 │   ├── 📂 CSS/              # CSS styles  collection
 │   │   ├── 📄 App.css           # Main styles
 │   │   ├── 📄 OverlayComponent.css # Overlay component styles
 │   │   └── 📄 Settings.css  # Settings styles
 │   │
 │   ├── 📄 App.js            # Main React  component
 │   ├── 📄 index.js          # React entry point
 │   └── 📄 MainComponent.js    # Main component
 │   └── 📄 OverlayComponent.js    # Overlay component
 │   └── 📄 SystemListener.js  # System event listener
 │
 ├── 📄 main.js               # Electron main process
 ├── 📄 package.json          # Project config/dependencies
 ├── 📄 .gitignore           # Git exclude files
 ├── 📄 README.md            # Project documentation
 └── 📄 README-KR.md            # Project documentation(Korean)

## Contribution

 ***Your contributions can enhance the quality of this program!***  

 We deeply appreciate feedback and assistance from talented individuals.  
 Feel free to suggest improvements or highlight areas that need refinement!

## Running the Program

 1. Clone the repository:

   ```bash
   git clone https://github.com/WareAoba/Paraglide
   ```

 2. Install NPM in root directory of the project:

   ```bash
   git clone https://github.com/WareAoba/Paraglide
   ```

 3. Run the program with the following command:
   
   ```bash
   npm run dev
   ```

   Precompiled binaries will be uploaded at a later date.


## Recent Updates

 1. **Sidebar** Added: View recent files and switch to them directly.
 2. Task Completion Button: A fun but admittedly trivial addition.
 3. **Keyboard Shortcuts Activated**: Shortcuts are now fully functional!
 4. Clipboard Monitoring: The program automatically pauses when external clipboard changes are detected.
 5. **Settings**: Settings Component is now available.

## Features in Development

 1. Browsing Feature: Scroll through all paragraphs (to be implemented with a button and new window).
 2. Search Function: Search text/paragraphs and jump to the desired paragraph.
 3. Click-to-Jump in the overlay window.
 4. Enhanced Animations: The most challenging part—requires significant rework.
 5. UI Icons: From pause/resume buttons to future buttons.defaults, highlight colors, etc.
 6. User Guide: A detailed manual to accompany the beta release.
 7. File Editing: Simple modifications like renaming files or editing paragraph content.

## Known Issues

 1. Overlay layout misalignment: Paragraphs should have equal spacing, but gaps between current/next and previous/current are inconsistent.
 2. UI properties are being migrated to CSS, leaving the UI temporarily messy.
 3. The new Sidebar’s design is subpar—scheduled for improvement.
 4. Issues with real-time theme switching; handlers seem to be missing.
 5. Files occasionally unload randomly, with the cause still unidentified.
 6. The 'loadLastOverlayBounds' setting does not work.

## Beta Release?

 The ongoing CSS theme implementation is a daunting task and may take a few more days, but essential features should be completed soon. Beta v0.1 is targeted for release by the end of the month.
 If I had coding experience, this would’ve progressed much faster, but tinkering with AI often breaks working features—fixing those takes up most of my time. 😂

## License

 The majority of the code for this program was generated using **GitHub Copilot Chat**.

 The program and its source code are distributed under the **MIT License**.
