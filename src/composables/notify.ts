import { Message } from "@arco-design/web-vue";
import { useNotificationStore, NotificationType } from "../store";

// Every ad-hoc toast in the app goes through here so it's both shown once
// (briefly, in a single consistent spot) and archived in the notification
// center for later review, instead of components each rolling their own
// Message calls at random positions.
const DEFAULT_DURATIONS: Record<NotificationType, number> = {
    success: 2000,
    error: 4000,
    warning: 3000,
    info: 2500,
};

function emit(type: NotificationType, content: string, duration?: number) {
    useNotificationStore().push(type, content);
    Message[type]({
        id: crypto.randomUUID(),
        content,
        duration: duration ?? DEFAULT_DURATIONS[type],
        position: "top",
    });
}

export const notify = {
    success: (content: string, duration?: number) => emit("success", content, duration),
    error: (content: string, duration?: number) => emit("error", content, duration),
    warning: (content: string, duration?: number) => emit("warning", content, duration),
    info: (content: string, duration?: number) => emit("info", content, duration),
};
