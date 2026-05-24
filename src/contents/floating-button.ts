import type { PlasmoCSConfig } from "plasmo"
import { createApp } from "vue"

import FloatingButton from "../content-ui/FloatingButton.vue"

export const config: PlasmoCSConfig = {
    matches: ["http://*/*", "https://*/*"]
}

const FLOATING_BUTTON_MOUNTED_KEY = "__nuciFloatingButtonMounted__"

declare global {
    interface Window {
        [FLOATING_BUTTON_MOUNTED_KEY]?: boolean
    }
}

function mount() {
    if (window.top !== window.self) return
    if (window[FLOATING_BUTTON_MOUNTED_KEY]) return
    if (document.getElementById("kc-float-root")) return

    window[FLOATING_BUTTON_MOUNTED_KEY] = true

    const container = document.createElement("div")
    container.id = "kc-float-root"
    document.body.appendChild(container)

    createApp(FloatingButton).mount(container)
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount)
} else {
    mount()
}
