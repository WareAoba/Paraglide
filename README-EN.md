<img width="1093" alt="LogoDarkReady" src="https://github.com/user-attachments/assets/d9c3df89-3937-4ba7-b278-c76bb44f14e9#gh-dark-mode-only"><br>
<img width="1093" alt="LogoLightReady" src="https://github.com/user-attachments/assets/7c2e239b-3684-436e-a23c-5ebf85db1ab9#gh-light-mode-only">

# Paraglide - Paragraph Processor

 A program designed to automate the process of **sequentially copying each paragraph** from a loaded .TXT file and moving to the **next paragraph upon detecting Ctrl[Cmd] + V input**.

## Overview

![Welcome](https://github.com/user-attachments/assets/26e3d119-6da2-4861-a337-dda5eeb73665)
![Comparison](https://github.com/user-attachments/assets/7a51a03d-a1bb-4598-aefa-8fd1ec112a88)
![Paste](https://github.com/user-attachments/assets/2d0b1ec6-81f7-4e3c-a32d-c3207a16cba8)
![Shortcut](https://github.com/user-attachments/assets/c40498b3-9945-4137-a20e-fec5a4978d1e)

## Key Features

 1. Load .TXT files and split paragraphs, displaying **previous/current/next** paragraphs.
 2. Monitor keyboard input and perform **actions based on key combinations**:
   - **Paste (Ctrl + V, Cmd + V)**: Copy the next paragraph.
   - **Shift + Arrow Keys (←→)**: Navigate to the previous/next paragraph.
     - **Shift + Alt (Opt) + Arrow Keys (←→)**: Navigate to the previous/next page.
   - **Shift + Arrow Keys (↑↓)**: Pause/Resume the program.
     - **Shift + Alt (Opt) + Arrow Key (↑)**: Toggle overlay.
   - and, there are also many other **in-app shortcuts**.
 3. Process text based on **paragraph** or **line** depending on the style of the .TXT file.
 4. Display the **current paragraph in progress** with an overlay window and allow navigation between paragraphs.
 5. Save logs to restore the **last position** when reloading a previously processed file.
 6. Quickly **load previously worked files** within the app.
 7. **Search** feature to enhance work efficiency.

## Purpose of Development

 Inspired by [SB2Tool](https://github.com/JOWONRO/SB2Tool), this program addresses one major limitation of the original tool: **it was Windows-exclusive**. 

 Despite not being a professional coder, I enthusiastically leveraged GPT to create this program. Written in **JavaScript** (NPM, React, Electron), it works across platforms, making it **more versatile** than the Windows-only predecessor.

## Project Overview
```
📦 Paraglide
├── 📂 public                              # Static Resources
│   ├── 📂 icons                           # App Icons
│   └── 📂 UI_icons                        # UI Icons
│
├── 📂 src                                 # Source Code
│   ├── 📂 components                      # React Components
│   │   ├── 📂 sidebar                     # Sidebar Components
│   │   │   ├── 📜 Panel.jsx               # Sidebar Info Panel
│   │   │   └── 📜 Search.jsx              # Search Component
│   │   │
│   │   ├── 📂 Views                       # Main Component View Modes
│   │   │   ├── 📜 Console.jsx             # Terminal Console
│   │   │   ├── 📜 DragDropOverlay.js      # Drag & Drop Overlay
│   │   │   ├── 📜 ListView.jsx            # ListView
│   │   │   └── 📜 Overview.jsx            # Overview
│   │   │
│   │   ├── 📜 MainComponent.jsx           # Main Component
│   │   ├── 📜 OverlayComponent.jsx        # Overlay Component
│   │   ├── 📜 Settings.jsx                # Settings Component
│   │   └── 📜 Sidebar.jsx                 # Sidebar Component
│   │
│   ├── 📂 CSS                             # Stylesheets
│   │   ├── 📂 Controllers                 # Global Styles for Settings Controllers
│   │   ├── 📂 Sidebar                     # Sidebar Component Styles
│   │   ├── 📂 Views                       # Main Component View Modes
│   │   │   
│   │   ├── 📜 App.css                     # Global Styles
│   │   ├── 📜 MainComponent.css           # Main Component Styles
│   │   ├── 📜 OverlayComponent.css        # Overlay Styles
│   │   ├── 📜 Settings.css                # Settings Styles
│   │   └── 📜 Sidebar.js                  # Sidebar Styles
│   │
│   ├── 📂 store                           # Redux Store
│   │   ├── 📂 slices                      # Redux Reducers
│   │   ├── 📂 utils                       # Redux Processors
│   │   └── 📜 store.js                    # Redux Store Entry Point
│   │ 
│   ├── 📜 App.jsx                         # React Entry Point
│   ├── 📜 index.jsx                       # App Entry Point
│   ├── 📜 main.js                         # Electron Main Process
│   └── 📜 SystemListener.jsx              # System Event Handler
│
├── 📜 forge.config.js                     # Electron Forge Configuration
├── 📜 LICENSE                             # License File
├── 📜 package.json                        # Project Configuration
├── 📜 README.md                           # Project Documentation
├── 📜 README-EN.md                        # Project Documentation (English)
└── 📜 vite.config.js                      # Vite Configuration
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
 - Install **Paraglide-win32-x64-setup.exe**.
 - Automatically registered in the program group.

- **macOS**:

 - Mount **Paraglide-darwin-arm64.dmg**.
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


## Recent Updates
### Last Release: 0.3.1beta

 1. **UI Overhaul**: Redesigned with a mix of Material and Neumorphism design. Additionally, various UI animations have been added.
   - The **Sidebar** functionality has been greatly enhanced.
   - The highlight color feature has been enabled in the settings.
   - You can directly select the app theme in the settings.

 2. **Search Function Added**: Currently supports Korean the best, at least for now.
   - Supports initial consonant search, partial match search, and exact match search(Korean Only).
   - Highlight colors vary depending on the search type.
   - You can move the pointer and select using the keyboard.

 3. **Various Shortcuts Added**: The following shortcuts can be used in combination with the Ctrl (Cmd) key.
   - **O**: Open file
   - **F**: Open search window (only available when a file is loaded)
   - **,** : Open settings window

 4. **Internal Logic Improvements**: Various internal changes have been made, including the adoption of Vite.

 5. Add Console Display: You can check internal massages the program sends.

 6. **Multilingual Support**: English, Japanese, and Chinese are prioritized.




## Features in Development

 1. **Photoshop Mode**: Automatically input text layer creation using Photoshop API.
 2. **built-in Text Editor**: Planned to be equipped with convenient features for tasks like translation work.
 3. **Overlay refactoring**: Planning to significantly improve functionality.
 4. **User Guide**: Plan to write a detailed manual for the program.

## Known Issues
 1. There is a performance issue with initial launch speed of the compiled app on Windows.
 This appears to be security-related and will be addressed in a future update.
 2. Unexpected bugs may have occurred during logic modification. Please report any issues!

## License

 **All uses are permitted except for direct sales.**
 Feel free to use, modify, and redistribute this program as you wish!

 The majority of the code for this program was generated using **GitHub Copilot Chat**.

 The program and its source code are distributed under the **MIT License**.
