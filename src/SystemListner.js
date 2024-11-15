import {GlobalKeyboardListener} from "node-global-key-listener";

const v = new GlobalKeyboardListener();

// capture ctrl + v on windows and command + v on mac
// important: command on mac is the meta key
v.addListener(function (e, down) {
    if (
        e.state == "DOWN" &&
        e.name == "V" &&
        (down["LEFT CTRL"] || down["RIGHT CTRL"] || down["LEFT META"] || down["RIGHT META"])
    ) {
        console.log("Ctrl + V");
    }
});

v.addListener(function (e, down) {
    if (e.state == "DOWN" && down["LEFT ALT"]){
        switch (e.name) {
            case "LEFT ARROW":
                console.log("ALT + LEFT");
                break;
            case "RIGHT ARROW":
                console.log("ALT + RIGHT");
                break;
            case "UP ARROW":
                console.log("ALT + UP");
                break;
            case "DOWN ARROW":
                console.log("ALT + DOWN");
                break;
        }
    }
});
