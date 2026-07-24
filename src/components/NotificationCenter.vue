<template>
    <a-popover
        trigger="click"
        :position="variant === 'rail' ? 'rt' : 'br'"
        content-class="st-notif-popover"
        v-model:popup-visible="open"
    >
        <a-tooltip v-if="variant === 'rail'" :content="t('NOTIFICATIONS_Title')" position="right" :disabled="open">
            <button class="st-rail-btn st-notif-btn">
                <i class="fa-sharp fa-light fa-bell"></i>
                <span v-if="unreadCount > 0" class="st-notif-badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
            </button>
        </a-tooltip>
        <a-tooltip v-else :content="t('NOTIFICATIONS_Title')" position="bottom" :disabled="open">
            <button class="st-notif-btn st-notif-btn--inline">
                <i class="fa-sharp fa-light fa-bell"></i>
                <span v-if="unreadCount > 0" class="st-notif-badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
            </button>
        </a-tooltip>

        <template #content>
            <div class="st-notif-panel">
                <div class="st-notif-panel-header">
                    <span class="st-notif-panel-title">{{ t('NOTIFICATIONS_Title') }}</span>
                    <button
                        v-if="store.notifications.length > 0"
                        class="st-notif-action"
                        @click="store.clear()"
                    >{{ t('NOTIFICATIONS_ClearAll') }}</button>
                </div>
                <div class="st-notif-list">
                    <div v-if="store.notifications.length === 0" class="st-notif-empty">
                        <i class="fa-sharp fa-light fa-bell-slash"></i>
                        <span>{{ t('NOTIFICATIONS_Empty') }}</span>
                    </div>
                    <div
                        v-for="n in store.notifications"
                        :key="n.id"
                        class="st-notif-item"
                        :class="`st-notif-item--${n.type}`"
                    >
                        <i :class="iconFor(n.type)"></i>
                        <div class="min-w-0 grow">
                            <p class="st-notif-content">{{ n.content }}</p>
                            <p class="st-notif-time">{{ formatTime(n.timestamp) }}</p>
                        </div>
                        <button class="st-notif-dismiss" @click.stop="store.remove(n.id)">
                            <i class="fa-sharp fa-light fa-xmark"></i>
                        </button>
                    </div>
                </div>
            </div>
        </template>
    </a-popover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useNotificationStore, NotificationType } from "../store";

withDefaults(defineProps<{ variant?: "rail" | "inline" }>(), { variant: "rail" });

const { t, locale } = useI18n();
const store = useNotificationStore();
const open = ref(false);
const unreadCount = computed(() => store.unreadCount);

// Reading the panel is what clears the badge, same as any OS notification center.
watch(open, (visible) => {
    if (visible) store.markAllRead();
});

function iconFor(type: NotificationType): string {
    switch (type) {
        case "success":
            return "fa-sharp fa-solid fa-circle-check";
        case "error":
            return "fa-sharp fa-solid fa-circle-exclamation";
        case "warning":
            return "fa-sharp fa-solid fa-triangle-exclamation";
        default:
            return "fa-sharp fa-solid fa-circle-info";
    }
}

function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString(locale.value, { hour: "2-digit", minute: "2-digit" });
}
</script>

<style scoped>
.st-notif-btn {
    position: relative;
}
.st-notif-btn--inline {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--st-text-2);
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--st-border);
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: 14px;
}
.st-notif-btn--inline:hover {
    color: var(--st-text-1);
    border-color: var(--st-border-strong);
}
.st-notif-badge {
    position: absolute;
    top: 2px;
    right: 2px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: var(--st-danger);
    color: white;
    font-size: 10px;
    font-weight: 700;
    line-height: 16px;
    text-align: center;
    box-shadow: 0 0 0 2px var(--st-bg-1);
}
</style>

<style>
/* Popover content renders in a teleported root, so these rules live unscoped. */
.st-notif-popover .arco-popover-popup-content {
    padding: 0;
}
.st-notif-panel {
    width: 320px;
    max-height: 420px;
    display: flex;
    flex-direction: column;
}
.st-notif-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--st-border);
}
.st-notif-panel-title {
    font-weight: 700;
    font-size: 13px;
}
.st-notif-action {
    background: transparent;
    border: none;
    color: var(--st-accent-soft);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    padding: 0;
}
.st-notif-action:hover {
    text-decoration: underline;
}
.st-notif-list {
    overflow-y: auto;
    padding: 6px;
}
.st-notif-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 32px 12px;
    color: var(--st-text-3);
    font-size: 13px;
}
.st-notif-empty i {
    font-size: 22px;
    opacity: 0.6;
}
.st-notif-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 9px 8px;
    border-radius: 10px;
}
.st-notif-item:hover {
    background: rgba(255, 255, 255, 0.03);
}
.st-notif-item i:first-child {
    margin-top: 2px;
    font-size: 13px;
}
.st-notif-item--success i:first-child {
    color: var(--st-success);
}
.st-notif-item--error i:first-child {
    color: var(--st-danger);
}
.st-notif-item--warning i:first-child {
    color: var(--st-warning);
}
.st-notif-item--info i:first-child {
    color: var(--st-accent-soft);
}
.st-notif-content {
    font-size: 13px;
    color: var(--st-text-1);
    line-height: 1.4;
    margin: 0;
}
.st-notif-time {
    font-size: 11px;
    color: var(--st-text-3);
    margin: 2px 0 0;
}
.st-notif-dismiss {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--st-text-3);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
}
.st-notif-dismiss:hover {
    color: var(--st-text-1);
    background: rgba(255, 255, 255, 0.06);
}
</style>
