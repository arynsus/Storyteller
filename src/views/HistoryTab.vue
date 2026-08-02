<template>
    <div class="flex flex-col grow min-h-0 gap-4 p-5">
        <!-- Summary strip -->
        <div class="st-panel shrink-0 flex items-center gap-3 px-4 py-3">
            <div class="st-hist-stat">
                <i class="fa-sharp fa-light fa-books"></i>
                <div>
                    <p class="st-hist-stat-value">{{ historyStore.books.length }}</p>
                    <p class="st-hist-stat-label">{{ t('HISTORY_StatBooks') }}</p>
                </div>
            </div>
            <div class="st-hist-stat">
                <i class="fa-sharp fa-light fa-file-audio"></i>
                <div>
                    <p class="st-hist-stat-value">{{ chapterCount }}</p>
                    <p class="st-hist-stat-label">{{ t('HISTORY_StatChapters') }}</p>
                </div>
            </div>
            <div class="st-hist-stat">
                <i class="fa-sharp fa-light fa-hard-drive"></i>
                <div>
                    <p class="st-hist-stat-value">{{ formatBytes(cacheInfoStore.size) }}</p>
                    <p class="st-hist-stat-label">{{ t('HISTORY_StatCacheSize') }}</p>
                </div>
            </div>
            <div class="st-hist-stat" :class="{ 'st-hist-stat--warn': historyStore.unfinishedBytes > 0 }">
                <i class="fa-sharp fa-light fa-broom-wide"></i>
                <div>
                    <p class="st-hist-stat-value">{{ formatBytes(cacheInfoStore.reclaimable) }}</p>
                    <p class="st-hist-stat-label">{{ t('HISTORY_StatClearable') }}</p>
                </div>
            </div>
            <div class="grow"></div>
            <a-button size="small" @click="openFolder">
                <template #icon><i class="fa-sharp fa-light fa-folder-open"></i></template>
                {{ t('HISTORY_ButtonOpenFolder') }}
            </a-button>
        </div>

        <!-- Threshold notice: the rail icon turns red, this explains why -->
        <div v-if="overThreshold" class="st-hist-banner shrink-0">
            <i class="fa-sharp fa-solid fa-triangle-exclamation"></i>
            <span>{{ t('HISTORY_ThresholdBanner', { size: formatBytes(cacheInfoStore.size), limit: `${ttsConfigStore.config.cacheClearThresholdMB} MB` }) }}</span>
        </div>

        <!-- Library -->
        <div class="st-panel grow flex flex-col min-h-0">
            <div class="st-panel-header">
                <div class="st-panel-title">
                    <i class="fa-sharp fa-light fa-clock-rotate-left"></i>
                    <span>{{ t('HISTORY_Title') }}</span>
                </div>
                <div class="flex items-center gap-3">
                    <a-input
                        v-model="query"
                        size="small"
                        allow-clear
                        :placeholder="t('HISTORY_SearchPlaceholder')"
                        class="w-[220px]"
                    >
                        <template #prefix><i class="fa-sharp fa-light fa-magnifying-glass"></i></template>
                    </a-input>
                </div>
            </div>

            <div class="grow min-h-0 overflow-y-auto px-3 py-3 flex flex-col gap-3">
                <!-- Empty state -->
                <div
                    v-if="!historyStore.loading && filteredBooks.length === 0 && filteredUnfinished.length === 0 && historyStore.orphans.count === 0"
                    class="h-full flex flex-col items-center justify-center gap-3 st-text-3"
                >
                    <i class="fa-sharp fa-light fa-clock-rotate-left text-4xl opacity-60"></i>
                    <p class="text-[14px]">{{ query ? t('HISTORY_EmptySearch') : t('HISTORY_EmptyState') }}</p>
                </div>

                <!-- One card per book -->
                <div v-for="book in filteredBooks" :key="book.id" class="st-book">
                    <div class="st-book-head" @click="toggleBook(book.id)">
                        <div class="st-cover">
                            <img v-if="book.coverArtPath" :src="cacheUrl(book.coverArtPath)" alt="" />
                            <i v-else class="fa-sharp fa-light fa-book"></i>
                        </div>
                        <div class="min-w-0 grow">
                            <p class="st-book-title truncate">{{ book.title || t('HISTORY_UntitledBook') }}</p>
                            <p class="st-text-3 text-[12px] truncate mt-0.5">
                                <template v-if="book.author">{{ book.author }} · </template>
                                {{ book.jobs.length }} {{ t('HISTORY_ChaptersSuffix') }}
                                <template v-if="book.totalDurationSec"> · {{ formatLongDuration(book.totalDurationSec) }}</template>
                                · {{ formatBytes(book.totalBytes) }}
                            </p>
                        </div>
                        <div class="flex items-center gap-2 shrink-0" @click.stop>
                            <a-tooltip :content="t('HISTORY_ButtonDownloadBook')" position="top">
                                <button class="st-icon-btn" @click="downloadMany(book.jobs)">
                                    <i class="fa-sharp fa-light fa-download"></i>
                                </button>
                            </a-tooltip>
                            <a-tooltip :content="t('HISTORY_ButtonFreeCache')" position="top">
                                <button
                                    class="st-icon-btn"
                                    :disabled="bookReclaimable(book) === 0"
                                    @click="askFreeCache(book.jobs, book.title || t('HISTORY_UntitledBook'))"
                                >
                                    <i class="fa-sharp fa-light fa-broom-wide"></i>
                                </button>
                            </a-tooltip>
                            <a-tooltip :content="t('HISTORY_ButtonDeleteBook')" position="top">
                                <button
                                    class="st-icon-btn st-icon-btn--danger"
                                    @click="askDelete(book.jobs, book.title || t('HISTORY_UntitledBook'))"
                                >
                                    <i class="fa-sharp fa-light fa-trash-can"></i>
                                </button>
                            </a-tooltip>
                            <button class="st-icon-btn" @click="toggleBook(book.id)">
                                <i
                                    class="fa-sharp fa-light"
                                    :class="expandedBooks.has(book.id) ? 'fa-chevron-up' : 'fa-chevron-down'"
                                ></i>
                            </button>
                        </div>
                    </div>

                    <div v-if="expandedBooks.has(book.id)" class="st-book-body">
                        <div
                            v-for="job in book.jobs"
                            :key="job.jobId"
                            class="st-chapter"
                            :class="{ 'is-playing': playingJobId === job.jobId }"
                        >
                            <button class="st-chapter-play" @click="togglePlay(job)">
                                <i
                                    class="fa-sharp fa-solid"
                                    :class="playingJobId === job.jobId && isPlaying ? 'fa-pause' : 'fa-play'"
                                ></i>
                            </button>

                            <div class="min-w-0 grow">
                                <p class="truncate text-[13px]">{{ chapterLabel(job) }}</p>
                                <div v-if="playingJobId === job.jobId" class="mt-1.5 flex items-center gap-2">
                                    <div class="st-track grow" @click="seek($event)">
                                        <span :style="{ width: `${progressPercent}%` }"></span>
                                    </div>
                                    <span class="st-text-3 text-[11px] tabular-nums shrink-0">
                                        {{ formatDuration(currentTime) }} / {{ formatDuration(duration || job.durationSec) }}
                                    </span>
                                </div>
                                <p v-else class="st-text-3 text-[11px] mt-0.5 truncate">
                                    {{ formatDate(job.completedAt, locale) }}
                                    <template v-if="job.durationSec"> · {{ formatDuration(job.durationSec) }}</template>
                                    · {{ formatBytes(job.outputBytes ?? 0) }}
                                    <template v-if="job.ttsConfig"> · {{ job.ttsConfig.voice }}</template>
                                </p>
                            </div>

                            <span v-if="job.reclaimableBytes > 0" class="st-chapter-cache">
                                <i class="fa-sharp fa-light fa-box-archive"></i>{{ formatBytes(job.reclaimableBytes) }}
                            </span>

                            <div class="flex items-center gap-2 shrink-0">
                                <a-tooltip :content="t('HISTORY_ButtonDownload')" position="top">
                                    <button class="st-icon-btn" @click="downloadOne(job)">
                                        <i class="fa-sharp fa-light fa-download"></i>
                                    </button>
                                </a-tooltip>
                                <a-tooltip :content="t('HISTORY_ButtonFreeCache')" position="top">
                                    <button
                                        class="st-icon-btn"
                                        :disabled="job.reclaimableBytes === 0"
                                        @click="askFreeCache([job], chapterLabel(job))"
                                    >
                                        <i class="fa-sharp fa-light fa-broom-wide"></i>
                                    </button>
                                </a-tooltip>
                                <a-tooltip :content="t('HISTORY_ButtonDelete')" position="top">
                                    <button
                                        class="st-icon-btn st-icon-btn--danger"
                                        @click="askDelete([job], chapterLabel(job))"
                                    >
                                        <i class="fa-sharp fa-light fa-trash-can"></i>
                                    </button>
                                </a-tooltip>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Everything holding cache without an audio file to show for it -->
                <div v-if="filteredUnfinished.length > 0 || historyStore.orphans.count > 0" class="st-book st-book--warn">
                    <div class="st-book-head" @click="unfinishedOpen = !unfinishedOpen">
                        <div class="st-cover st-cover--warn">
                            <i class="fa-sharp fa-light fa-triangle-exclamation"></i>
                        </div>
                        <div class="min-w-0 grow">
                            <p class="st-book-title truncate">{{ t('HISTORY_UnfinishedTitle') }}</p>
                            <p class="st-text-3 text-[12px] truncate mt-0.5">
                                {{ t('HISTORY_UnfinishedSubtitle', {
                                    jobs: historyStore.unfinished.length,
                                    orphans: historyStore.orphans.count,
                                    size: formatBytes(historyStore.unfinishedBytes),
                                }) }}
                            </p>
                        </div>
                        <div class="flex items-center gap-2 shrink-0" @click.stop>
                            <a-button size="small" status="danger" @click="askClearUnfinished">
                                <template #icon><i class="fa-sharp fa-light fa-broom-wide"></i></template>
                                {{ t('HISTORY_ButtonClearUnfinished') }}
                            </a-button>
                            <button class="st-icon-btn" @click="unfinishedOpen = !unfinishedOpen">
                                <i class="fa-sharp fa-light" :class="unfinishedOpen ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
                            </button>
                        </div>
                    </div>

                    <div v-if="unfinishedOpen" class="st-book-body">
                        <div v-for="job in filteredUnfinished" :key="job.jobId" class="st-chapter">
                            <span class="st-pill shrink-0" :class="statusPillClass(job)">
                                <i :class="statusPillIcon(job)"></i>{{ statusLabel(job) }}
                            </span>
                            <div class="min-w-0 grow">
                                <p class="truncate text-[13px]">{{ chapterLabel(job) }}</p>
                                <p class="st-text-3 text-[11px] mt-0.5 truncate">
                                    {{ formatDate(job.createdAt, locale) }} · {{ formatBytes(job.reclaimableBytes) }}
                                    <template v-if="job.error"> · {{ job.error }}</template>
                                </p>
                            </div>
                            <a-tooltip :content="job.active ? t('HISTORY_DeleteDisabledActive') : t('HISTORY_ButtonDelete')" position="top">
                                <button
                                    class="st-icon-btn st-icon-btn--danger shrink-0"
                                    :disabled="job.active"
                                    @click="askDelete([job], chapterLabel(job))"
                                >
                                    <i class="fa-sharp fa-light fa-trash-can"></i>
                                </button>
                            </a-tooltip>
                        </div>
                        <p v-if="historyStore.orphans.count > 0" class="st-hint px-3 py-2">
                            {{ t('HISTORY_OrphanHint', {
                                count: historyStore.orphans.count,
                                size: formatBytes(historyStore.orphans.bytes),
                            }) }}
                        </p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Inside the root element on purpose: a second root node would make
             this a fragment component, and the parent's v-show would have
             nothing to bind to (the tab would show on every screen). Arco
             teleports the modal to <body> regardless of where it's declared. -->
        <a-modal
            :visible="confirm !== null"
            :title="confirm?.title"
            :ok-text="confirm?.okText"
            :cancel-text="t('HISTORY_ConfirmCancel')"
            :ok-button-props="{ status: confirm?.danger ? 'danger' : 'normal' }"
            :ok-loading="working"
            @ok="runConfirm"
            @cancel="confirm = null"
        >
            <p class="text-[14px] leading-relaxed">{{ confirm?.message }}</p>
            <p v-if="confirm?.note" class="st-hint mt-3">{{ confirm.note }}</p>
        </a-modal>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { notify } from "../composables/notify";
import { formatBytes, formatDate, formatDuration, formatLongDuration } from "../composables/format";
import { useCacheInfoStore, useFileListStore, useHistoryStore, useTTSConfigStore } from "../store";
import type { BookGroup } from "../store";
import type { JobEntry } from "../../global/types";

const props = defineProps<{ active: boolean }>();

const { t, locale } = useI18n();
const historyStore = useHistoryStore();
const cacheInfoStore = useCacheInfoStore();
const ttsConfigStore = useTTSConfigStore();
const fileListStore = useFileListStore();

const query = ref("");
const expandedBooks = ref<Set<string>>(new Set());
const unfinishedOpen = ref(false);
const working = ref(false);

const cacheUrl = (filePath: string) => window.storyteller.cacheFileUrl(filePath);
const openFolder = () => window.storyteller.openCacheFolder();

const chapterCount = computed(() => historyStore.jobs.filter((job) => job.hasAudio).length);
const overThreshold = computed(
    () => cacheInfoStore.size > ttsConfigStore.config.cacheClearThresholdMB * 1024 * 1024
);

function chapterLabel(job: JobEntry): string {
    const num = job.metadata?.chapterNumber;
    const title = job.metadata?.chapterTitle;
    if (num && title) return `${num} — ${title}`;
    if (title) return title;
    if (num) return `${t("HISTORY_ChapterPrefix")} ${num}`;
    return job.filename.replace(/\.txt$/i, "");
}

function matchesQuery(job: JobEntry, bookTitle = "", author = ""): boolean {
    const needle = query.value.trim().toLowerCase();
    if (!needle) return true;
    return [bookTitle, author, job.filename, job.metadata?.chapterTitle, job.metadata?.chapterNumber]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
}

const filteredBooks = computed<BookGroup[]>(() => {
    const needle = query.value.trim().toLowerCase();
    if (!needle) return historyStore.books;
    return historyStore.books
        .map((book) => ({ ...book, jobs: book.jobs.filter((job) => matchesQuery(job, book.title, book.author)) }))
        .filter((book) => book.jobs.length > 0);
});
const filteredUnfinished = computed(() => historyStore.unfinished.filter((job) => matchesQuery(job)));

const bookReclaimable = (book: BookGroup) => book.jobs.reduce((sum, job) => sum + job.reclaimableBytes, 0);

// ---- playback: one element for the whole tab, streamed via st-cache:// ----
const audio = ref<HTMLAudioElement | null>(null);
const playingJobId = ref<string | null>(null);
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);

const progressPercent = computed(() => (duration.value > 0 ? (currentTime.value / duration.value) * 100 : 0));

function stopPlayback() {
    audio.value?.pause();
    audio.value = null;
    playingJobId.value = null;
    isPlaying.value = false;
    currentTime.value = 0;
    duration.value = 0;
}

function togglePlay(job: JobEntry) {
    if (playingJobId.value === job.jobId && audio.value) {
        if (audio.value.paused) {
            audio.value.play();
            isPlaying.value = true;
        } else {
            audio.value.pause();
            isPlaying.value = false;
        }
        return;
    }
    stopPlayback();
    if (!job.outputPath) return;
    const el = new Audio(cacheUrl(job.outputPath));
    el.addEventListener("timeupdate", () => {
        currentTime.value = el.currentTime;
        if (Number.isFinite(el.duration)) duration.value = el.duration;
    });
    el.addEventListener("loadedmetadata", () => {
        if (Number.isFinite(el.duration)) duration.value = el.duration;
    });
    el.addEventListener("ended", () => (isPlaying.value = false));
    el.addEventListener("error", () => {
        notify.error(t("HISTORY_PlaybackFailed"));
        stopPlayback();
    });
    audio.value = el;
    playingJobId.value = job.jobId;
    el.play();
    isPlaying.value = true;
}

function seek(event: MouseEvent) {
    if (!audio.value || duration.value <= 0) return;
    const track = event.currentTarget as HTMLElement;
    const ratio = (event.clientX - track.getBoundingClientRect().left) / track.offsetWidth;
    audio.value.currentTime = Math.max(0, Math.min(1, ratio)) * duration.value;
}

// ---- destructive actions, all funnelled through one confirm dialog ----
interface Confirm {
    title: string;
    message: string;
    note?: string;
    okText: string;
    danger: boolean;
    run: () => Promise<void>;
}
const confirm = ref<Confirm | null>(null);

async function runConfirm() {
    if (!confirm.value) return;
    working.value = true;
    try {
        await confirm.value.run();
    } finally {
        working.value = false;
        confirm.value = null;
    }
}

function askFreeCache(jobs: JobEntry[], label: string) {
    const jobIds = jobs.filter((job) => !job.active && job.reclaimableBytes > 0).map((job) => job.jobId);
    const bytes = jobs.reduce((sum, job) => sum + job.reclaimableBytes, 0);
    confirm.value = {
        title: t("HISTORY_ConfirmFreeTitle"),
        message: t("HISTORY_ConfirmFreeMessage", { name: label, size: formatBytes(bytes) }),
        note: t("HISTORY_ConfirmFreeNote"),
        okText: t("HISTORY_ButtonFreeCache"),
        danger: false,
        run: async () => {
            const result = await window.storyteller.freeJobsCache(jobIds);
            notify.success(t("HISTORY_FreedToast", { size: formatBytes(result.freedBytes) }));
            await refresh();
        },
    };
}

function askDelete(jobs: JobEntry[], label: string) {
    const jobIds = jobs.map((job) => job.jobId);
    const bytes = jobs.reduce((sum, job) => sum + job.reclaimableBytes + (job.outputBytes ?? 0), 0);
    confirm.value = {
        title: t("HISTORY_ConfirmDeleteTitle"),
        message: t("HISTORY_ConfirmDeleteMessage", { name: label, count: jobs.length, size: formatBytes(bytes) }),
        note: t("HISTORY_ConfirmDeleteNote"),
        okText: t("HISTORY_ButtonDelete"),
        danger: true,
        run: async () => {
            const result = await window.storyteller.deleteJobs(jobIds);
            // A deleted job's queue row would point at files that no longer exist.
            result.deleted.forEach((jobId) => fileListStore.removeFile(jobId));
            if (result.deleted.includes(playingJobId.value ?? "")) stopPlayback();
            if (result.skipped.length > 0) {
                notify.warning(t("HISTORY_DeleteSkippedActive", { count: result.skipped.length }));
            }
            notify.success(t("HISTORY_DeletedToast", { size: formatBytes(result.freedBytes) }));
            await refresh();
        },
    };
}

function askClearUnfinished() {
    const jobIds = historyStore.unfinished.filter((job) => !job.active).map((job) => job.jobId);
    confirm.value = {
        title: t("HISTORY_ConfirmClearUnfinishedTitle"),
        message: t("HISTORY_ConfirmClearUnfinishedMessage", {
            count: jobIds.length,
            size: formatBytes(historyStore.unfinishedBytes),
        }),
        note: t("HISTORY_ConfirmClearUnfinishedNote"),
        okText: t("HISTORY_ButtonClearUnfinished"),
        danger: true,
        run: async () => {
            const deleted = await window.storyteller.deleteJobs(jobIds);
            deleted.deleted.forEach((jobId) => fileListStore.removeFile(jobId));
            const orphans = await window.storyteller.clearOrphanCache();
            notify.success(t("HISTORY_DeletedToast", { size: formatBytes(deleted.freedBytes + orphans.freedBytes) }));
            await refresh();
        },
    };
}

// ---- downloads ----
async function downloadOne(job: JobEntry) {
    if (!job.outputPath) return;
    const result = await window.storyteller.downloadFile(job.outputPath);
    if (result.success) {
        notify.success(`${t("MESSAGE_DownloadFileSuccessBeforeFilename")}${result.filename}${t("MESSAGE_DownloadFileSuccessAfterFilename")}`);
    } else {
        notify.error(`${t("MESSAGE_DownloadFileFailure")}${result.error}.`);
    }
}

async function downloadMany(jobs: JobEntry[]) {
    const paths = jobs.map((job) => job.outputPath).filter(Boolean) as string[];
    if (paths.length === 0) return;
    const result = await window.storyteller.downloadFiles(paths);
    if (result.succeeded > 0) {
        notify.success(`${t("MESSAGE_DownloadFilesBeforeSuccessNumber")}${result.succeeded}${t("MESSAGE_DownloadFilesAfterSuccessNumber")}`);
    }
    if (result.failed > 0) {
        notify.error(`${t("MESSAGE_DownloadFilesBeforeFailureNumber")}${result.failed}${t("MESSAGE_DownloadFilesAfterFailureNumber")}`);
    }
}

// ---- status presentation for the unfinished bucket ----
function statusLabel(job: JobEntry): string {
    if (job.active) return t("HISTORY_StatusConverting");
    if (job.status === "pending") return t("HISTORY_StatusPending");
    return t("HISTORY_StatusFailed");
}
function statusPillClass(job: JobEntry): string {
    if (job.active) return "st-pill--active";
    return job.status === "pending" ? "st-pill--queue" : "st-pill--error";
}
function statusPillIcon(job: JobEntry): string {
    if (job.active) return "fa-sharp fa-solid fa-spinner fa-spin";
    return job.status === "pending"
        ? "fa-sharp fa-solid fa-hourglass-half"
        : "fa-sharp fa-solid fa-circle-exclamation";
}

// ---- loading: only while the tab is on screen, so a busy conversion doesn't
// keep re-statting the cache in the background ----
async function refresh() {
    await Promise.all([historyStore.refresh(), cacheInfoStore.refresh()]);
}

let dirty = false;
let unsubHistory: (() => void) | null = null;

watch(
    () => props.active,
    (active) => {
        if (active && (dirty || !historyStore.loaded)) {
            dirty = false;
            refresh();
        }
    },
    { immediate: true }
);

onMounted(() => {
    unsubHistory = window.storyteller.onHistoryChanged(() => {
        if (props.active) refresh();
        else dirty = true;
    });
});
onUnmounted(() => {
    unsubHistory?.();
    stopPlayback();
});
</script>

<style scoped>
.st-hist-stat {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px 8px 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--st-border);
    min-width: 132px;
}
.st-hist-stat i {
    font-size: 18px;
    color: var(--st-accent-soft);
}
.st-hist-stat--warn i {
    color: var(--st-warning);
}
.st-hist-stat-value {
    font-size: 16px;
    font-weight: 700;
    line-height: 1.2;
    margin: 0;
    font-variant-numeric: tabular-nums;
}
.st-hist-stat-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--st-text-3);
    margin: 2px 0 0;
}
.st-hist-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    border-radius: 12px;
    font-size: 13px;
    color: var(--st-warning);
    background: rgba(255, 176, 32, 0.1);
    border: 1px solid rgba(255, 176, 32, 0.3);
}

/* ---- book card ---- */
.st-book {
    border: 1px solid var(--st-border);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.02);
    overflow: hidden;
    transition: border-color 0.12s ease;
}
.st-book:hover {
    border-color: var(--st-border-strong);
}
.st-book--warn {
    border-color: rgba(255, 176, 32, 0.28);
    background: rgba(255, 176, 32, 0.04);
}
.st-book-head {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 14px;
    cursor: pointer;
    user-select: none;
}
.st-book-title {
    font-size: 14px;
    font-weight: 600;
    margin: 0;
}
.st-cover {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    color: var(--st-accent-soft);
    background: rgba(124, 108, 255, 0.12);
    border: 1px solid rgba(124, 108, 255, 0.25);
}
.st-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.st-cover--warn {
    color: var(--st-warning);
    background: rgba(255, 176, 32, 0.12);
    border-color: rgba(255, 176, 32, 0.28);
}
.st-book-body {
    border-top: 1px solid var(--st-border);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

/* ---- chapter row ---- */
.st-chapter {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid transparent;
    transition: background 0.12s ease, border-color 0.12s ease;
}
.st-chapter:hover {
    background: rgba(255, 255, 255, 0.03);
}
.st-chapter.is-playing {
    background: rgba(124, 108, 255, 0.1);
    border-color: rgba(124, 108, 255, 0.3);
}
.st-chapter-play {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    flex-shrink: 0;
    border: none;
    cursor: pointer;
    color: white;
    font-size: 11px;
    background: linear-gradient(135deg, var(--st-accent-soft), var(--st-accent-deep));
    box-shadow: 0 4px 12px -6px rgba(124, 108, 255, 0.9);
    transition: transform 0.12s ease;
}
.st-chapter-play:hover {
    transform: scale(1.06);
}
.st-chapter-cache {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    font-size: 11px;
    color: var(--st-text-3);
}
.st-chapter .st-track {
    cursor: pointer;
}

/* ---- shared icon button (matches the queue's) ---- */
.st-icon-btn {
    width: 30px;
    height: 30px;
    border-radius: 9px;
    border: 1px solid var(--st-border);
    background: rgba(255, 255, 255, 0.03);
    color: var(--st-text-2);
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.12s ease;
}
.st-icon-btn:hover:not(:disabled) {
    color: var(--st-text-1);
    border-color: var(--st-border-strong);
}
.st-icon-btn--danger:hover:not(:disabled) {
    color: var(--st-danger);
    border-color: rgba(255, 92, 114, 0.5);
    background: rgba(255, 92, 114, 0.08);
}
.st-icon-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
}
</style>
