"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrashCan } from "@fortawesome/free-regular-svg-icons";
import { faBagShopping, faDollarSign, faWandSparkles, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { supabase } from "../lib/supabase";

config.autoAddCss = false;

type LunchStatus = "pack" | "buy" | "unset";
type ListType = "grocery" | "todo" | "project" | "gift";
type AppView = "dashboard" | "month";

type CalendarEvent = {
  id: string;
  title: string;
  time: string;
};

type DaySummary = {
  id: string;
  name: string;
  date: string;
  isoDate: string;
  isToday?: boolean;
  events: CalendarEvent[];
  moreCount: number;
};

type TaskItem = {
  id: string;
  title: string;
  completed: boolean;
};

type GroceryItem = {
  id: string;
  title: string;
  completed: boolean;
};

type ListItem = TaskItem | GroceryItem;

type MonthCell = {
  key: string;
  date: Date;
  dayNumber: number;
  monthLabel: string;
  dateLabel: string;
  isoDate: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  linkedWeekDay: DaySummary | null;
  lunchStatus: LunchStatus;
};

type MonthLunchMap = Record<string, LunchStatus>;

type SelectedMonthDay = {
  isoDate: string;
  dateLabel: string;
  lunchStatus: LunchStatus;
};

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
};

type GoogleCalendarApiEvent = {
  id?: string;
  summary?: string;
  start?: {
    date?: string;
    dateTime?: string;
  };
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
          }) => {
            requestAccessToken: () => void;
          };
        };
      };
    };
  }
}

function getNow() {
  return new Date();
}

function getStartOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

function formatIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const TODAY_YEAR = getNow().getFullYear();
const TODAY_MONTH = getNow().getMonth();
const TODAY_ISO = formatIsoDate(getNow());

const initialWeekData: DaySummary[] = [
  {
    id: "mon",
    name: "Mon",
    date: "Apr 13",
    isoDate: "2026-04-13",
    events: [
      { id: "m1", title: "School", time: "8:00 AM" },
      { id: "m2", title: "Soccer", time: "5:00 PM" },
    ],
    moreCount: 1,
  },
  {
    id: "tue",
    name: "Tue",
    date: "Apr 14",
    isoDate: "2026-04-14",
    events: [{ id: "t1", title: "Library", time: "7:45 AM" }],
    moreCount: 0,
  },
  {
    id: "wed",
    name: "Wed",
    date: "Apr 15",
    isoDate: "2026-04-15",
    events: [{ id: "w1", title: "Piano", time: "4:00 PM" }],
    moreCount: 0,
  },
  {
    id: "thu",
    name: "Thu",
    date: "Apr 16",
    isoDate: "2026-04-16",
    events: [{ id: "th1", title: "Early Release", time: "3:00 PM" }],
    moreCount: 0,
  },
  {
    id: "fri",
    name: "Fri",
    date: "Apr 17",
    isoDate: "2026-04-17",
    isToday: true,
    events: [
      { id: "f1", title: "Dropoff", time: "8:15 AM" },
      { id: "f2", title: "Soccer", time: "3:30 PM" },
    ],
    moreCount: 1,
  },
  {
    id: "sat",
    name: "Sat",
    date: "Apr 18",
    isoDate: "2026-04-18",
    events: [{ id: "s1", title: "Game", time: "10:00 AM" }],
    moreCount: 0,
  },
  {
    id: "sun",
    name: "Sun",
    date: "Apr 19",
    isoDate: "2026-04-19",
    events: [{ id: "su1", title: "Family Dinner", time: "6:00 PM" }],
    moreCount: 0,
  },
];

const initialTasks: TaskItem[] = [
  { id: "task-1", title: "Sign permission slip", completed: false },
  { id: "task-2", title: "Send lunch money", completed: false },
  { id: "task-3", title: "Call dentist", completed: false },
  { id: "task-4", title: "Return item", completed: false },
];

const initialGroceries: GroceryItem[] = [
  { id: "g-1", title: "Milk", completed: false },
  { id: "g-2", title: "Eggs", completed: false },
  { id: "g-3", title: "Bread", completed: false },
  { id: "g-4", title: "Fruit", completed: false },
];

const initialProjects: TaskItem[] = [];
const initialGifts: TaskItem[] = [];

const initialMonthLunchData: MonthLunchMap = {
  "2026-04-13": "pack",
  "2026-04-14": "buy",
  "2026-04-15": "pack",
  "2026-04-16": "unset",
  "2026-04-17": "pack",
  "2026-04-18": "buy",
  "2026-04-19": "unset",
};

const GOOGLE_CLIENT_ID = "518556462383-7ome7i5li01rarcjqpvq9cfkqa07jctm.apps.googleusercontent.com";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GOOGLE_CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

function lunchLabel(status: LunchStatus) {
  if (status === "pack") return "Pack";
  if (status === "buy") return "Buy";
  return "Not set";
}

function buildWeekFromStart(startDate: Date): DaySummary[] {
  const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    const isoDate = formatIsoDate(date);
    const dateLabel = `${date.toLocaleString("en-US", { month: "short" })} ${date.getDate()}`;

    const existing = initialWeekData.find((day) => day.isoDate === isoDate);

    return {
      id: existing?.id ?? `day-${isoDate}`,
      name: weekdayNames[date.getDay()],
      date: dateLabel,
      isoDate,
      isToday: isoDate === TODAY_ISO,
      events: existing?.events ?? [],
      moreCount: existing?.moreCount ?? 0,
    } satisfies DaySummary;
  });
}

function getEventIsoDate(event: GoogleCalendarApiEvent) {
  if (event.start?.date) return event.start.date;
  if (event.start?.dateTime) return event.start.dateTime.slice(0, 10);
  return null;
}

function formatEventTime(event: GoogleCalendarApiEvent) {
  if (!event.start?.dateTime) return "";

  return new Date(event.start.dateTime).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function mapGoogleEventsByDate(items: GoogleCalendarApiEvent[]) {
  return items.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
    const isoDate = getEventIsoDate(event);
    if (!isoDate) return acc;

    const mappedEvent: CalendarEvent = {
      id: event.id ?? `${isoDate}-${event.summary ?? "event"}`,
      title: event.summary ?? "Untitled event",
      time: formatEventTime(event),
    };

    acc[isoDate] = acc[isoDate] ? [...acc[isoDate], mappedEvent] : [mappedEvent];
    return acc;
  }, {});
}

function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <div className={`mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${color}`}>
      {label}
    </div>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col rounded-[28px] bg-white/80 p-4 shadow-[0_20px_50px_rgba(15,23,42,0.08)] ring-1 ring-white/90 backdrop-blur-xl">
      {title ? <h2 className="mb-4 text-xl font-semibold tracking-[-0.03em] text-slate-950">{title}</h2> : null}
      {children}
    </div>
  );
}

function LunchSelector({
  value,
  onChange,
}: {
  value: LunchStatus;
  onChange: (value: LunchStatus) => void;
}) {
  const options: {
    value: Exclude<LunchStatus, "unset">;
    icon: React.ReactNode;
    label: string;
  }[] = [
    {
      value: "pack",
      icon: <FontAwesomeIcon icon={faBagShopping} className="text-xl" />,
      label: "Pack",
    },
    {
      value: "buy",
      icon: <FontAwesomeIcon icon={faDollarSign} className="text-xl" />,
      label: "Buy",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((option) => {
        const isActive = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={[
              "min-h-12 rounded-2xl px-3 py-2 text-sm font-semibold transition flex flex-col items-center justify-center gap-1.5 transform",
              isActive
                ? option.value === "pack"
                  ? "bg-amber-200 text-amber-900 ring-2 ring-amber-400 scale-[0.98] shadow-inner"
                  : "bg-emerald-200 text-emerald-900 ring-2 ring-emerald-400 scale-[0.98] shadow-inner"
                : "bg-white/90 text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.98]",
            ].join(" ")}
          >
            <span className="flex items-center justify-center">{option.icon}</span>
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function DayColumn({
  day,
  lunchStatus,
  onClick,
}: {
  day: DaySummary;
  lunchStatus: LunchStatus;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex h-full min-h-[380px] flex-col rounded-[24px] p-3 text-left transition",
        day.isToday
          ? "border-2 border-blue-300 bg-gradient-to-br from-blue-50 via-indigo-50 to-white shadow-[0_16px_32px_rgba(59,130,246,0.14)]"
          : "border border-white/90 bg-white/70 shadow-sm hover:-translate-y-0.5 hover:border-slate-200 hover:bg-white",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">{day.name}</div>
          <div className="text-xs font-medium text-slate-500">{day.date}</div>
        </div>
      </div>

      <div className="mt-3">
        {lunchStatus !== "unset" && (
          <div className="text-lg text-slate-700">
            <FontAwesomeIcon icon={lunchStatus === "pack" ? faBagShopping : faDollarSign} />
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {day.events.slice(0, 2).map((event) => (
          <div key={event.id} className="rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-slate-100">
            <div className="text-sm font-medium text-slate-900">{event.title}</div>
            <div className="text-xs text-slate-500">{event.time || ""}</div>
          </div>
        ))}
      </div>

      <div className="mt-auto pt-3 text-xs text-slate-500">{day.moreCount > 0 ? `+${day.moreCount} more` : ""}</div>
    </button>
  );
}

function ChecklistItem({
  label,
  checked,
  isEditing,
  editValue,
  isDragging,
  onToggle,
  onStartEdit,
  onEditChange,
  onEditSave,
  onEditCancel,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  label: string;
  checked: boolean;
  isEditing: boolean;
  editValue: string;
  isDragging: boolean;
  onToggle: () => void;
  onStartEdit: () => void;
  onEditChange: (value: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable={!isEditing}
      onDragStart={onDragStart}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      onClick={() => {
        if (!isEditing) onToggle();
      }}
      className={[
        "flex items-center gap-3 rounded-2xl px-2 py-2 transition",
        isDragging ? "opacity-50 ring-2 ring-violet-300" : "hover:bg-slate-50",
      ].join(" ")}
    >
      <div className="cursor-grab text-neutral-400">⋮⋮</div>

      <input
        checked={checked}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        type="checkbox"
        className="h-4 w-4 rounded border-neutral-300"
      />

      {isEditing ? (
        <input
          autoFocus
          value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={onEditSave}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") onEditSave();
            if (e.key === "Escape") onEditCancel();
          }}
          className="min-w-0 flex-1 rounded-xl border border-blue-300 px-3 py-1 text-base text-neutral-900 outline-none"
        />
      ) : (
        <>
          <span
            onClick={(e) => {
              e.stopPropagation();
              onStartEdit();
            }}
            className={`cursor-pointer text-base transition hover:text-blue-700 ${
              checked ? "text-neutral-400 line-through" : "text-neutral-900"
            }`}
          >
            {label}
          </span>
          <div className="flex-1" />
        </>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="text-base text-neutral-500 transition hover:text-red-600"
      >
        <FontAwesomeIcon icon={faTrashCan} />
      </button>
    </div>
  );
}

function AddItemModal({
  open,
  title,
  value,
  onChange,
  onClose,
  onSubmit,
  submitLabel,
}: {
  open: boolean;
  title: string;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl ring-1 ring-black/5">
        <div className="text-lg font-semibold text-neutral-900">{title}</div>
        <div className="mt-1 text-sm text-neutral-500">Type a name and save it to the list.</div>

        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
            if (e.key === "Escape") onClose();
          }}
          placeholder="Enter item"
          className="mt-4 h-12 w-full rounded-2xl border border-neutral-200 px-4 text-base text-neutral-900 outline-none transition focus:border-blue-400"
        />

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onClose}
            className="min-h-12 rounded-2xl bg-neutral-100 px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-200"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            className="min-h-12 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(59,130,246,0.28)] transition hover:-translate-y-0.5 hover:from-blue-500 hover:to-indigo-500 active:scale-95"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function MonthCellCard({
  cell,
  bulkLunchEditMode,
  onOpenDay,
  onSetLunch,
}: {
  cell: MonthCell;
  bulkLunchEditMode: boolean;
  onOpenDay: (isoDate: string) => void;
  onSetLunch: (isoDate: string, value: LunchStatus) => void;
}) {
  const linked = cell.linkedWeekDay;

  if (!bulkLunchEditMode) {
    return (
      <button
        type="button"
        onClick={() => onOpenDay(cell.isoDate)}
        className={[
          "flex min-h-[120px] w-full flex-col items-start justify-start rounded-2xl border p-3 text-left align-top transition",
          cell.isToday
            ? "border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50"
            : cell.isCurrentMonth
              ? "border-white/90 bg-white/80 hover:bg-slate-50"
              : "border-neutral-200 bg-neutral-50 text-neutral-400",
          "cursor-pointer shadow-sm",
        ].join(" ")}
      >
        <div className="flex items-center justify-start gap-2 self-start">
          <div className={`text-sm font-semibold ${cell.isCurrentMonth ? "text-neutral-900" : "text-neutral-400"}`}>
            {cell.dayNumber}
          </div>
          {cell.lunchStatus !== "unset" ? (
            <div className="text-base text-neutral-700">
              <FontAwesomeIcon icon={cell.lunchStatus === "pack" ? faBagShopping : faDollarSign} />
            </div>
          ) : null}
        </div>

        {linked ? (
          <div className="mt-3 w-full space-y-1">
            {linked.events.slice(0, 2).map((event) => (
              <div key={event.id} className="truncate text-xs text-neutral-700">
                {event.time ? `${event.time} ` : ""}
                {event.title}
              </div>
            ))}
            {linked.moreCount > 0 ? <div className="text-xs text-neutral-500">+{linked.moreCount} more</div> : null}
          </div>
        ) : null}
      </button>
    );
  }

  return (
    <div
      className={[
        "flex min-h-[120px] flex-col items-start justify-start rounded-2xl border p-3 text-left align-top transition shadow-sm",
        cell.isToday
          ? "border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50"
          : cell.isCurrentMonth
            ? "border-white/90 bg-white/80"
            : "border-neutral-200 bg-neutral-50 text-neutral-400",
      ].join(" ")}
    >
      <div className="flex items-center justify-start gap-2 self-start">
        <div className={`text-sm font-semibold ${cell.isCurrentMonth ? "text-neutral-900" : "text-neutral-400"}`}>
          {cell.dayNumber}
        </div>
        {cell.lunchStatus !== "unset" ? (
          <div className="text-base text-neutral-700">
            <FontAwesomeIcon icon={cell.lunchStatus === "pack" ? faBagShopping : faDollarSign} />
          </div>
        ) : null}
      </div>

      {cell.isCurrentMonth ? (
        <div className="mt-3 grid w-full grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onSetLunch(cell.isoDate, "pack")}
            className={[
              "rounded-xl px-2 py-2 text-xs font-semibold transition flex items-center justify-center gap-1",
              cell.lunchStatus === "pack"
                ? "bg-amber-200 text-amber-900 ring-2 ring-amber-400"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200",
            ].join(" ")}
          >
            <FontAwesomeIcon icon={faBagShopping} />
            <span>Pack</span>
          </button>
          <button
            type="button"
            onClick={() => onSetLunch(cell.isoDate, "buy")}
            className={[
              "rounded-xl px-2 py-2 text-xs font-semibold transition flex items-center justify-center gap-1",
              cell.lunchStatus === "buy"
                ? "bg-emerald-200 text-emerald-900 ring-2 ring-emerald-400"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200",
            ].join(" ")}
          >
            <FontAwesomeIcon icon={faDollarSign} />
            <span>Buy</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MonthView({
  monthDate,
  weekData,
  calendarEventsByDate,
  monthLunchData,
  bulkLunchEditMode,
  onToggleBulkLunchEditMode,
  onBack,
  onPrevMonth,
  onNextMonth,
  onOpenDay,
  onSetLunch,
}: {
  monthDate: Date;
  weekData: DaySummary[];
  calendarEventsByDate: Record<string, CalendarEvent[]>;
  monthLunchData: MonthLunchMap;
  bulkLunchEditMode: boolean;
  onToggleBulkLunchEditMode: () => void;
  onBack: () => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onOpenDay: (isoDate: string) => void;
  onSetLunch: (isoDate: string, value: LunchStatus) => void;
}) {
  const monthCells = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = firstOfMonth.getDay();
    const gridStart = new Date(year, month, 1 - startOffset);
    const weekDataByDate = new Map(weekData.map((day) => [day.date, day]));

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const isCurrentMonth = date.getMonth() === month;
      const monthLabel = date.toLocaleString("en-US", { month: "short" });
      const dateLabel = `${monthLabel} ${date.getDate()}`;
      const isoDate = formatIsoDate(date);
      const linkedWeekDay = weekDataByDate.get(dateLabel) ?? null;
      const calendarEvents = calendarEventsByDate[isoDate] ?? [];
      const lunchStatus = monthLunchData[isoDate] ?? "unset";

      return {
        key: isoDate,
        date,
        dayNumber: date.getDate(),
        monthLabel,
        dateLabel,
        isoDate,
        isCurrentMonth,
        isToday: isoDate === TODAY_ISO,
        linkedWeekDay: linkedWeekDay
          ? {
              ...linkedWeekDay,
              events: calendarEvents,
              moreCount: Math.max(0, calendarEvents.length - 2),
            }
          : calendarEvents.length > 0
            ? {
                id: `calendar-${isoDate}`,
                name: date.toLocaleString("en-US", { weekday: "short" }),
                date: dateLabel,
                isoDate,
                events: calendarEvents,
                moreCount: Math.max(0, calendarEvents.length - 2),
              }
            : null,
        lunchStatus,
      } satisfies MonthCell;
    });
  }, [calendarEventsByDate, monthDate, monthLunchData, weekData]);

  const monthTitle = monthDate.toLocaleString("en-US", { month: "long", year: "numeric" });
  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="mt-4 rounded-[28px] bg-white/80 p-4 shadow-[0_20px_50px_rgba(15,23,42,0.08)] ring-1 ring-white/90 backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:bg-neutral-50"
          >
            Back to Dashboard
          </button>
          <button
            onClick={onPrevMonth}
            className="rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:bg-neutral-50"
          >
            ←
          </button>
          <button
            onClick={onNextMonth}
            className="rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:bg-neutral-50"
          >
            →
          </button>
          <button
            onClick={onToggleBulkLunchEditMode}
            className={[
              "rounded-2xl px-4 py-2 text-sm font-semibold transition",
              bulkLunchEditMode
                ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-[0_10px_20px_rgba(139,92,246,0.28)] hover:-translate-y-0.5"
                : "bg-white text-neutral-900 shadow-sm ring-1 ring-black/5 hover:-translate-y-0.5 hover:bg-neutral-50",
            ].join(" ")}
          >
            {bulkLunchEditMode ? "Done Planning" : "Plan Month Lunches"}
          </button>
        </div>

        <div>
          <SectionLabel label="Calendar" color="text-blue-500" />
          <div className="text-xl font-semibold tracking-[-0.03em] text-neutral-900">{monthTitle}</div>
        </div>
      </div>

      {bulkLunchEditMode ? (
        <div className="mb-4 rounded-[24px] bg-gradient-to-r from-violet-50 to-fuchsia-50 px-4 py-3 text-sm text-violet-900 ring-1 ring-violet-100">
          Quick mode is on. Tap <span className="font-semibold">Pack</span> or <span className="font-semibold">Buy</span> on each day to plan the month faster.
        </div>
      ) : null}

      <div className="grid grid-cols-7 gap-3">
        {weekdayLabels.map((label) => (
          <div key={label} className="px-1 text-sm font-semibold text-neutral-500">
            {label}
          </div>
        ))}

        {monthCells.map((cell) => (
          <MonthCellCard
            key={cell.key}
            cell={cell}
            bulkLunchEditMode={bulkLunchEditMode}
            onOpenDay={onOpenDay}
            onSetLunch={onSetLunch}
          />
        ))}
      </div>
    </div>
  );
}

function DayDetailDrawer({
  day,
  lunchStatus,
  open,
  onClose,
  onLunchChange,
}: {
  day: DaySummary | null;
  lunchStatus: LunchStatus;
  open: boolean;
  onClose: () => void;
  onLunchChange: (value: LunchStatus) => void;
}) {
  if (!open || !day) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-stretch justify-end bg-black/20 p-4">
      <div className="pointer-events-auto flex h-full w-full max-w-md flex-col rounded-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xl font-semibold text-neutral-900">{day.name}, {day.date}</div>
            <div className="mt-1 text-sm text-neutral-500">Day details</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-2xl bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-700"
          >
            Close
          </button>
        </div>

        <div className="mt-6 space-y-5 overflow-auto">
          <div>
            <div className="text-sm font-medium uppercase tracking-wide text-neutral-500">Events</div>
            <div className="mt-3 space-y-2">
              {day.events.length > 0 ? (
                day.events.map((event) => (
                  <div key={event.id} className="rounded-2xl bg-neutral-50 p-3">
                    <div className="font-medium text-neutral-900">{event.title}</div>
                    <div className="text-sm text-neutral-500">{event.time || ""}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-neutral-50 p-3 text-sm text-neutral-500">No events</div>
              )}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium uppercase tracking-wide text-neutral-500">School</div>
            <div className="mt-3 rounded-[24px] bg-gradient-to-br from-amber-50 to-orange-50 p-4 ring-1 ring-amber-100">
              <div className="text-base font-medium text-neutral-900">Leah’s lunch</div>
              <div className="mt-3">
                <LunchSelector value={lunchStatus} onChange={onLunchChange} />
              </div>
              <button
                onClick={() => onLunchChange("unset")}
                className="mt-3 text-sm font-medium text-neutral-500 transition hover:text-neutral-800"
              >
                Clear selection
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MonthLunchDrawer({
  day,
  events,
  open,
  onClose,
  onLunchChange,
}: {
  day: SelectedMonthDay | null;
  events: CalendarEvent[];
  open: boolean;
  onClose: () => void;
  onLunchChange: (value: LunchStatus) => void;
}) {
  if (!open || !day) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-stretch justify-end bg-black/20 p-4">
      <div className="pointer-events-auto flex h-full w-full max-w-md flex-col rounded-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xl font-semibold text-neutral-900">{day.dateLabel}</div>
            <div className="mt-1 text-sm text-neutral-500">Lunch plan</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-2xl bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-700"
          >
            Close
          </button>
        </div>

        <div className="mt-6 space-y-5 overflow-auto">
          <div>
            <div className="text-sm font-medium uppercase tracking-wide text-neutral-500">Events</div>
            <div className="mt-3 space-y-2">
              {events.length > 0 ? (
                events.map((event) => (
                  <div key={event.id} className="rounded-2xl bg-neutral-50 p-3">
                    <div className="font-medium text-neutral-900">{event.title}</div>
                    <div className="text-sm text-neutral-500">{event.time || ""}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-neutral-50 p-3 text-sm text-neutral-500">No events</div>
              )}
            </div>
          </div>

          <div className="rounded-[24px] bg-gradient-to-br from-amber-50 to-orange-50 p-4 ring-1 ring-amber-100">
            <div className="text-base font-medium text-neutral-900">Packing Lunch?</div>
            <div className="mt-3">
              <LunchSelector value={day.lunchStatus} onChange={onLunchChange} />
            </div>
            <button
              onClick={() => onLunchChange("unset")}
              className="mt-3 text-sm font-medium text-neutral-500 transition hover:text-neutral-800"
            >
              Clear selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FamilyHubDashboardPrototype() {
  const googleTokenClientRef = useRef<{ requestAccessToken: () => void } | null>(null);
  const [weekData, setWeekData] = useState<DaySummary[]>(initialWeekData);
  const [weekStartDate, setWeekStartDate] = useState<Date>(getStartOfWeek(getNow()));
  const [currentTime, setCurrentTime] = useState<Date>(getNow());
  const [monthLunchData, setMonthLunchData] = useState<MonthLunchMap>({});
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [groceries, setGroceries] = useState<GroceryItem[]>([]);
  const [projects, setProjects] = useState<TaskItem[]>([]);
  const [gifts, setGifts] = useState<TaskItem[]>([]);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [selectedMonthDate, setSelectedMonthDate] = useState<string | null>(null);
  const [addModalType, setAddModalType] = useState<ListType | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [editingItemType, setEditingItemType] = useState<ListType | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemName, setEditItemName] = useState("");
  const [hasLoadedWeekData, setHasLoadedWeekData] = useState(false);
  const [hasLoadedMonthLunchData, setHasLoadedMonthLunchData] = useState(false);
  const [hasLoadedLists, setHasLoadedLists] = useState(false);
  const [draggingItemType, setDraggingItemType] = useState<ListType | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [appView, setAppView] = useState<AppView>("dashboard");
  const [monthDate, setMonthDate] = useState(new Date(TODAY_YEAR, TODAY_MONTH, 1));
  const [bulkLunchEditMode, setBulkLunchEditMode] = useState(false);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false);
  const [googleCalendarError, setGoogleCalendarError] = useState<string | null>(null);
  const [googleCalendarReady, setGoogleCalendarReady] = useState(false);
  const [calendarEventsByDate, setCalendarEventsByDate] = useState<Record<string, CalendarEvent[]>>({});
  const [googleCalendarLoading, setGoogleCalendarLoading] = useState(false);
  const [calendarEventsMode, setCalendarEventsMode] = useState<"week" | "month">("week");
  const [authEmail, setAuthEmail] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  useEffect(() => {
  const loadSession = async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session ?? null);
    setAuthLoading(false);
  };

  void loadSession();

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, newSession) => {
    setSession(newSession ?? null);
    setAuthLoading(false);
  });

  return () => {
    subscription.unsubscribe();
  };
}, []);

  useEffect(() => {
    const existingScript = document.querySelector('script[data-google-gsi="true"]');
    if (existingScript) {
      setGoogleCalendarReady(Boolean(window.google?.accounts?.oauth2));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleGsi = "true";
    script.onload = () => {
      setGoogleCalendarReady(Boolean(window.google?.accounts?.oauth2));
    };
    script.onerror = () => {
      setGoogleCalendarError("Google Calendar failed to load.");
    };
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (!googleCalendarReady || !window.google?.accounts?.oauth2) return;

    googleTokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_CALENDAR_SCOPE,
      callback: (response: GoogleTokenResponse) => {
        if (response.error || !response.access_token) {
          setGoogleCalendarError("Google Calendar authorization was not completed.");
          setGoogleCalendarConnected(false);
          return;
        }

        setGoogleAccessToken(response.access_token);
        setGoogleCalendarConnected(true);
        setGoogleCalendarError(null);
      },
    });
  }, [googleCalendarReady]);

  useEffect(() => {
    const savedWeekStartDate = localStorage.getItem("weekStartDate");
    if (savedWeekStartDate) {
      const parsedDate = new Date(savedWeekStartDate);
      setWeekStartDate(parsedDate);
      setWeekData(buildWeekFromStart(parsedDate));
    } else {
      const start = getStartOfWeek(getNow());
      setWeekStartDate(start);
      setWeekData(buildWeekFromStart(start));
    }
    setHasLoadedWeekData(true);
  }, []);

async function signInWithMagicLink() {
  setAuthMessage(null);

  const trimmedEmail = authEmail.trim().toLowerCase();
  if (!trimmedEmail) {
    setAuthMessage("Enter your email address.");
    return;
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: trimmedEmail,
    options: {
      emailRedirectTo: "https://family-hub-iota-brown.vercel.app",
    },
  });

  if (error) {
    setAuthMessage(error.message);
    return;
  }

  setAuthMessage("Check your email for the sign-in link.");
}

async function signOut() {
  await supabase.auth.signOut();
}

async function loadLunchPlansFromSupabase() {
  const { data, error } = await supabase.from("lunch_plans").select("*");

  if (error) {
    console.error("Error loading lunch plans:", error);
    setHasLoadedMonthLunchData(true);
    return;
  }

  const map: Record<string, LunchStatus> = {};

  (data ?? []).forEach((row: { plan_date: string; lunch_status: LunchStatus }) => {
    map[row.plan_date] = row.lunch_status;
  });

  setMonthLunchData(map);
  setHasLoadedMonthLunchData(true);
  console.log("Loaded lunch plans from Supabase:", map);
}

useEffect(() => {
  void loadLunchPlansFromSupabase();
}, []);

async function loadListItemsFromSupabase() {
  const { data, error } = await supabase
    .from("list_items")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Error loading list items:", error);
    setHasLoadedLists(true);
    return;
  }

  const groceryItems: GroceryItem[] = [];
  const todoItems: TaskItem[] = [];
  const projectItems: TaskItem[] = [];
  const giftItems: TaskItem[] = [];

  (data ?? []).forEach(
    (row: {
      id: string;
      list_type: "grocery" | "todo" | "project" | "gift";
      title: string;
      completed: boolean;
    }) => {
      const item = {
        id: row.id,
        title: row.title,
        completed: row.completed,
      };

      if (row.list_type === "grocery") groceryItems.push(item);
      if (row.list_type === "todo") todoItems.push(item);
      if (row.list_type === "project") projectItems.push(item);
      if (row.list_type === "gift") giftItems.push(item);
    }
  );

  setGroceries(groceryItems);
  setTasks(todoItems);
  setProjects(projectItems);
  setGifts(giftItems);
  setHasLoadedLists(true);
}

() => {
  void loadListItemsFromSupabase();
}

useEffect(() => {
  const lunchChannel = supabase
    .channel("realtime-lunch-plans")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "lunch_plans" },
      () => {
        void loadLunchPlansFromSupabase();
      }
    )
    .subscribe();

  const listChannel = supabase
    .channel("realtime-list-items")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "list_items" },
      () => {
        void loadListItemsFromSupabase();
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(lunchChannel);
    void supabase.removeChannel(listChannel);
  };
}, []);

useEffect(() => {
  const loadLists = async () => {
    const { data, error } = await supabase
      .from("list_items")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("Error loading list items:", error);
      setHasLoadedLists(true);
      return;
    }

    const groceryItems: GroceryItem[] = [];
    const todoItems: TaskItem[] = [];
    const projectItems: TaskItem[] = [];
    const giftItems: TaskItem[] = [];

    (data ?? []).forEach(
      (row: {
        id: string;
        list_type: "grocery" | "todo" | "project" | "gift";
        title: string;
        completed: boolean;
      }) => {
        const item = {
          id: row.id,
          title: row.title,
          completed: row.completed,
        };

        if (row.list_type === "grocery") groceryItems.push(item);
        if (row.list_type === "todo") todoItems.push(item);
        if (row.list_type === "project") projectItems.push(item);
        if (row.list_type === "gift") giftItems.push(item);
      }
    );

    setGroceries(groceryItems);
    setTasks(todoItems);
    setProjects(projectItems);
    setGifts(giftItems);
    setHasLoadedLists(true);
    console.log("Loaded list items from Supabase:", data);
  };

  void loadLists();
}, []);

  useEffect(() => {
    if (!hasLoadedWeekData) return;
    localStorage.setItem("weekStartDate", weekStartDate.toISOString());
  }, [weekStartDate, hasLoadedWeekData]);

if (authLoading) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#eef2ff_0%,_#f8fafc_34%,_#f5f5f5_100%)] text-neutral-900">
      <div className="mx-auto flex min-h-screen max-w-[1280px] items-center justify-center p-4">
        <div className="rounded-[28px] bg-white/80 px-6 py-4 text-sm font-medium text-slate-600 shadow-[0_20px_50px_rgba(15,23,42,0.08)] ring-1 ring-white/90 backdrop-blur-xl">
          Loading Family Hub...
        </div>
      </div>
    </div>
  );
}

if (!session) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#eef2ff_0%,_#f8fafc_34%,_#f5f5f5_100%)] text-neutral-900">
      <div className="mx-auto flex min-h-screen max-w-[560px] items-center justify-center p-4">
        <div className="w-full rounded-[28px] bg-white/80 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)] ring-1 ring-white/90 backdrop-blur-xl">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500">
            Family Hub
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Enter your email and we’ll send you a magic link.
          </p>

          <input
            type="email"
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-4 h-12 w-full rounded-2xl border border-neutral-200 px-4 text-base text-neutral-900 outline-none transition focus:border-blue-400"
          />

          <button
            onClick={() => void signInWithMagicLink()}
            className="mt-4 min-h-12 w-full rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(59,130,246,0.28)] transition hover:-translate-y-0.5 hover:from-blue-500 hover:to-indigo-500 active:scale-95"
          >
            Email me a sign-in link
          </button>

          {authMessage ? (
            <div className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-900 ring-1 ring-blue-100">
              {authMessage}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

  useEffect(() => {
    if (!hasLoadedMonthLunchData) return;
    localStorage.setItem("monthLunchData", JSON.stringify(monthLunchData));
  }, [monthLunchData, hasLoadedMonthLunchData]);

  useEffect(() => {
    if (!hasLoadedLists) return;
    localStorage.setItem("groceries", JSON.stringify(groceries));
  }, [groceries, hasLoadedLists]);

  useEffect(() => {
    if (!hasLoadedLists) return;
    localStorage.setItem("tasks", JSON.stringify(tasks));
  }, [tasks, hasLoadedLists]);

  useEffect(() => {
    if (!hasLoadedLists) return;
    localStorage.setItem("projects", JSON.stringify(projects));
  }, [projects, hasLoadedLists]);

  useEffect(() => {
    if (!hasLoadedLists) return;
    localStorage.setItem("gifts", JSON.stringify(gifts));
  }, [gifts, hasLoadedLists]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentTime(getNow());
    }, 1000 * 30);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!googleAccessToken) return;

    const fetchGoogleCalendarEvents = async () => {
      setGoogleCalendarLoading(true);
      setGoogleCalendarError(null);

      try {
        let timeMin: string;
        let timeMax: string;

        if (appView === "month") {
          setCalendarEventsMode("month");
          const year = monthDate.getFullYear();
          const month = monthDate.getMonth();
          const firstOfMonth = new Date(year, month, 1);
          const startOffset = firstOfMonth.getDay();
          const gridStart = new Date(year, month, 1 - startOffset);
          gridStart.setHours(0, 0, 0, 0);

          const gridEnd = new Date(gridStart);
          gridEnd.setDate(gridStart.getDate() + 42);
          gridEnd.setHours(0, 0, 0, 0);

          timeMin = gridStart.toISOString();
          timeMax = gridEnd.toISOString();
        } else {
          setCalendarEventsMode("week");
          const weekStart = new Date(weekStartDate);
          weekStart.setHours(0, 0, 0, 0);

          const weekEnd = new Date(weekStartDate);
          weekEnd.setDate(weekStartDate.getDate() + 7);
          weekEnd.setHours(0, 0, 0, 0);

          timeMin = weekStart.toISOString();
          timeMax = weekEnd.toISOString();
        }

        const query = new URLSearchParams({
          timeMin,
          timeMax,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "250",
        });

        const response = await fetch(`${GOOGLE_CALENDAR_API_BASE}?${query.toString()}`, {
          headers: {
            Authorization: `Bearer ${googleAccessToken}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Google Calendar request failed with status ${response.status}`);
        }

        const data = (await response.json()) as { items?: GoogleCalendarApiEvent[] };
        setCalendarEventsByDate(mapGoogleEventsByDate(data.items ?? []));
      } catch (error) {
        setGoogleCalendarError(error instanceof Error ? error.message : "Failed to fetch Google Calendar events.");
      } finally {
        setGoogleCalendarLoading(false);
      }
    };

    void fetchGoogleCalendarEvents();
  }, [appView, googleAccessToken, monthDate, weekStartDate]);

  const lunchStatusByDayId = useMemo(() => {
    const map: Record<string, LunchStatus> = {};
    weekData.forEach((day) => {
      map[day.id] = monthLunchData[day.isoDate] ?? "unset";
    });
    return map;
  }, [monthLunchData, weekData]);

  const weekDataWithEvents = useMemo(() => {
    return weekData.map((day) => {
      const events = calendarEventsByDate[day.isoDate] ?? [];
      return {
        ...day,
        events,
        moreCount: Math.max(0, events.length - 2),
      };
    });
  }, [calendarEventsByDate, weekData]);

  const today = useMemo(() => weekDataWithEvents.find((day) => day.isToday) ?? weekDataWithEvents[4], [weekDataWithEvents]);
  const weekRangeLabel = useMemo(() => {
    const start = weekDataWithEvents[0];
    const end = weekDataWithEvents[weekDataWithEvents.length - 1];
    if (!start || !end) return "";
    return `${start.date} – ${end.date}`;
  }, [weekDataWithEvents]);
  const todayLunchStatus = lunchStatusByDayId[today.id] ?? "unset";
  const tomorrow = useMemo(() => {
    const todayIndex = weekDataWithEvents.findIndex((day) => day.id === today.id);
    return weekDataWithEvents[(todayIndex + 1) % weekDataWithEvents.length];
  }, [today, weekDataWithEvents]);
  const tomorrowLunchStatus = lunchStatusByDayId[tomorrow.id] ?? "unset";
  const selectedDay = useMemo(() => weekDataWithEvents.find((day) => day.id === selectedDayId) ?? null, [selectedDayId, weekDataWithEvents]);
  const selectedDayLunchStatus = selectedDay ? lunchStatusByDayId[selectedDay.id] ?? "unset" : "unset";
  const selectedMonthDay = useMemo(() => {
    if (!selectedMonthDate) return null;
    const date = new Date(selectedMonthDate);
    const dateLabel = `${date.toLocaleString("en-US", { month: "short" })} ${date.getDate()}`;
    return {
      isoDate: selectedMonthDate,
      dateLabel,
      lunchStatus: monthLunchData[selectedMonthDate] ?? "unset",
    } satisfies SelectedMonthDay;
  }, [monthLunchData, selectedMonthDate]);
  const selectedMonthDayEvents = useMemo(() => {
    if (!selectedMonthDate) return [];
    return calendarEventsByDate[selectedMonthDate] ?? [];
  }, [calendarEventsByDate, selectedMonthDate]);


async function saveListItemsToSupabase(
  listType: ListType,
  items: ListItem[]
) {
  const { error: deleteError } = await supabase
    .from("list_items")
    .delete()
    .eq("list_type", listType);

  if (deleteError) {
    console.error(`Error clearing ${listType} items:`, deleteError);
    return;
  }

  if (items.length === 0) return;

  const rows = items.map((item, index) => ({
    id: item.id,
    list_type: listType,
    title: item.title,
    completed: item.completed,
    sort_order: index,
  }));

  const { error: insertError } = await supabase
    .from("list_items")
    .insert(rows);

  if (insertError) {
    console.error(`Error saving ${listType} items:`, insertError);
  }
}

function setListStateOnly(type: ListType, items: ListItem[]) {
  if (type === "grocery") {
    setGroceries(items as GroceryItem[]);
    return;
  }
  if (type === "todo") {
    setTasks(items as TaskItem[]);
    return;
  }
  if (type === "project") {
    setProjects(items as TaskItem[]);
    return;
  }
  setGifts(items as TaskItem[]);
}

async function updateMonthLunch(isoDate: string, lunchStatus: LunchStatus) {
  setMonthLunchData((current) => ({
    ...current,
    [isoDate]: lunchStatus,
  }));

  const { error } = await supabase.from("lunch_plans").upsert({
    plan_date: isoDate,
    lunch_status: lunchStatus,
  });

  if (error) {
    console.error("Error saving lunch plan:", error);
    return;
  }

  console.log("Saved lunch plan:", isoDate, lunchStatus);
}

function updateLunchByIsoDate(isoDate: string, lunchStatus: LunchStatus) {
  void updateMonthLunch(isoDate, lunchStatus);
}

  function shiftWeek(days: number) {
    const nextStart = new Date(weekStartDate);
    nextStart.setDate(weekStartDate.getDate() + days);
    setWeekStartDate(nextStart);
    setWeekData(buildWeekFromStart(nextStart));
    setSelectedDayId(null);
  }

  function jumpToTodayWeek() {
    const todayDate = getStartOfWeek(getNow());
    setWeekStartDate(todayDate);
    setWeekData(buildWeekFromStart(todayDate));
    setSelectedDayId(null);
  }

function updateListState(type: ListType, updater: (items: ListItem[]) => ListItem[]) {
  let currentItems: ListItem[] = [];

  if (type === "grocery") currentItems = groceries;
  if (type === "todo") currentItems = tasks;
  if (type === "project") currentItems = projects;
  if (type === "gift") currentItems = gifts;

  const nextItems = updater(currentItems);
  setListStateOnly(type, nextItems);
  void saveListItemsToSupabase(type, nextItems);
}

  function toggleInList(type: ListType, id: string) {
    updateListState(type, (items) => items.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item)));
  }

  function openAddModal(type: ListType) {
    setAddModalType(type);
    setNewItemName("");
  }

  function closeAddModal() {
    setAddModalType(null);
    setNewItemName("");
  }

  function submitAddModal() {
    const trimmed = newItemName.trim();
    if (!trimmed || !addModalType) return;

    const newItem = {
  id: crypto.randomUUID(),
  title: trimmed,
  completed: false,
};

    updateListState(addModalType, (items) => [...items, newItem]);
    closeAddModal();
  }

  function startEditItem(type: ListType, id: string, currentTitle: string) {
    setEditingItemType(type);
    setEditingItemId(id);
    setEditItemName(currentTitle);
  }

  function cancelInlineEdit() {
    setEditingItemType(null);
    setEditingItemId(null);
    setEditItemName("");
  }

  function saveInlineEdit() {
    const trimmed = editItemName.trim();
    if (!trimmed || !editingItemType || !editingItemId) {
      cancelInlineEdit();
      return;
    }

    updateListState(editingItemType, (items) => items.map((item) => (item.id === editingItemId ? { ...item, title: trimmed } : item)));
    cancelInlineEdit();
  }

  function deleteItem(type: ListType, id: string) {
    updateListState(type, (items) => items.filter((item) => item.id !== id));
  }

  function moveItemInList(type: ListType, fromId: string, toId: string) {
    if (fromId === toId) return;

    updateListState(type, (items) => {
      const fromIndex = items.findIndex((item) => item.id === fromId);
      const toIndex = items.findIndex((item) => item.id === toId);
      if (fromIndex === -1 || toIndex === -1) return items;

      const next = [...items];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function handleDragStart(type: ListType, id: string) {
    setDraggingItemType(type);
    setDraggingItemId(id);
  }

  function handleDragOver(id: string) {
    setDragOverItemId(id);
  }

  function handleDrop(type: ListType, targetId: string) {
    if (!draggingItemType || !draggingItemId) return;
    if (draggingItemType !== type) return;
    moveItemInList(type, draggingItemId, targetId);
    setDraggingItemType(null);
    setDraggingItemId(null);
    setDragOverItemId(null);
  }

  function handleDragEnd() {
    setDraggingItemType(null);
    setDraggingItemId(null);
    setDragOverItemId(null);
  }

  function renderList(items: ListItem[], type: ListType) {
    return items.map((item) => (
      <ChecklistItem
        key={item.id}
        label={item.title}
        checked={item.completed}
        isEditing={editingItemType === type && editingItemId === item.id}
        editValue={editingItemType === type && editingItemId === item.id ? editItemName : item.title}
        isDragging={Boolean((draggingItemType === type && draggingItemId === item.id) || dragOverItemId === item.id)}
        onToggle={() => toggleInList(type, item.id)}
        onStartEdit={() => startEditItem(type, item.id, item.title)}
        onEditChange={setEditItemName}
        onEditSave={saveInlineEdit}
        onEditCancel={cancelInlineEdit}
        onDelete={() => deleteItem(type, item.id)}
        onDragStart={() => handleDragStart(type, item.id)}
        onDragOver={() => handleDragOver(item.id)}
        onDrop={() => handleDrop(type, item.id)}
        onDragEnd={handleDragEnd}
      />
    ));
  }

  function clearChecked(type: ListType) {
    updateListState(type, (items) => items.filter((item) => !item.completed));
  }

  function connectGoogleCalendar() {
    if (!googleCalendarReady) {
      setGoogleCalendarError("Google Calendar script is still loading. Try again in a moment.");
      return;
    }

    if (!window.google?.accounts?.oauth2) {
      setGoogleCalendarError("Google Calendar library did not load correctly.");
      return;
    }

    if (!googleTokenClientRef.current) {
      setGoogleCalendarError("Google Calendar is not ready yet. Try again in a moment.");
      return;
    }

    googleTokenClientRef.current.requestAccessToken();
  }

  const addModalTitle =
    addModalType === "grocery"
      ? "Add Grocery Item"
      : addModalType === "todo"
        ? "Add To-Do Item"
        : addModalType === "project"
          ? "Add Long Term Project"
          : "Add Gift Idea";

  if (!hasLoadedMonthLunchData || !hasLoadedLists) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#eef2ff_0%,_#f8fafc_34%,_#f5f5f5_100%)] text-neutral-900">
      <div className="mx-auto flex min-h-screen max-w-[1280px] items-center justify-center p-4">
        <div className="rounded-[28px] bg-white/80 px-6 py-4 text-sm font-medium text-slate-600 shadow-[0_20px_50px_rgba(15,23,42,0.08)] ring-1 ring-white/90 backdrop-blur-xl">
          Loading Family Hub...
        </div>
      </div>
    </div>
  );
}

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#eef2ff_0%,_#f8fafc_34%,_#f5f5f5_100%)] text-neutral-900">
      <div className="mx-auto flex min-h-screen max-w-[1280px] flex-col p-4">
        <header className="rounded-[28px] bg-white/80 px-5 py-4 shadow-[0_20px_50px_rgba(15,23,42,0.08)] ring-1 ring-white/90 backdrop-blur-xl">
          <div className="grid grid-cols-12 items-center gap-4">
            <div className="col-span-8">
              <SectionLabel label="Family Hub" color="text-violet-500" />
              <div className="text-[2.2rem] font-semibold leading-none tracking-[-0.04em] text-slate-950">
                {currentTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </div>
              <div className="mt-1 text-sm font-medium text-slate-500">
                {currentTime.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </div>
            </div>

            <div className="col-span-4 flex items-center justify-end gap-3 text-sm">
              <div className="rounded-2xl bg-white px-3 py-2 text-neutral-700 shadow-sm ring-1 ring-black/5">72° Sunny</div>
              <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-emerald-700 shadow-sm ring-1 ring-emerald-100">Sync ✓</div>
              <button
                onClick={connectGoogleCalendar}
                className={[
                  "rounded-2xl px-3 py-2 font-medium transition shadow-sm ring-1 ring-black/5",
                  googleCalendarConnected
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-white text-neutral-700 hover:bg-neutral-50",
                ].join(" ")}
              >
                {googleCalendarConnected ? "Google Calendar Connected" : "Connect Google Calendar"}
              </button>
            </div>
          </div>

          {googleCalendarError ? (
            <div className="mt-3 rounded-[24px] bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-100">
              {googleCalendarError}
            </div>
          ) : null}

          {googleAccessToken ? (
            <div className="mt-3 rounded-[24px] bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 text-sm text-blue-900 ring-1 ring-blue-100">
              {googleCalendarLoading ? `Fetching Google Calendar events for ${calendarEventsMode} view...` : "Google Calendar connected."}
            </div>
          ) : null}
        </header>

        {appView === "dashboard" ? (
          <main className="mt-4 flex flex-1 flex-col gap-4">
            <div className="grid grid-cols-12 gap-4">
              <section className="col-span-3">
                <Card title="TODAY ✦">
                  <SectionLabel label="Focus" color="text-amber-500" />
                  <div className="flex flex-col gap-4">
                    <div className="rounded-[24px] bg-gradient-to-br from-slate-50 to-white p-4 ring-1 ring-slate-100">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Events</div>
                      <div className="mt-2 space-y-2 text-base text-neutral-900">
                        {today.events.length > 0 ? (
                          today.events.slice(0, 2).map((event) => (
                            <div key={event.id}>• {event.time ? `${event.time} ` : ""}{event.title}</div>
                          ))
                        ) : (
                          <div className="text-neutral-500">No events today</div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-[24px] bg-gradient-to-br from-amber-50 to-orange-50 p-4 ring-1 ring-amber-100">
                      <div className="text-xl font-semibold tracking-[-0.03em] text-neutral-900">Packing Lunch?</div>

                      <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800/70">Lunch Today</div>
                      <div className="mt-2">
                        <LunchSelector value={todayLunchStatus} onChange={(value) => updateLunchByIsoDate(today.isoDate, value)} />
                      </div>

                      <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800/70">Tomorrow</div>
                      <div className="mt-1 text-lg font-semibold tracking-[-0.02em] text-neutral-900">{lunchLabel(tomorrowLunchStatus)}</div>
                    </div>
                  </div>
                </Card>
              </section>

              <section className="col-span-9">
                <Card>
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <SectionLabel label="Calendar" color="text-blue-500" />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => shiftWeek(-7)}
                          className="rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:bg-neutral-50"
                        >
                          ←
                        </button>
                        <div>
                          <h2 className="text-xl font-semibold tracking-[-0.03em] text-neutral-900">THIS WEEK ✦</h2>
                          <div className="text-sm text-neutral-500">{weekRangeLabel}</div>
                        </div>
                        <button
                          onClick={() => shiftWeek(7)}
                          className="rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:bg-neutral-50"
                        >
                          →
                        </button>
                        <button
                          onClick={jumpToTodayWeek}
                          className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:bg-neutral-50"
                        >
                          Today
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => setAppView("month")}
                      className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(59,130,246,0.28)] transition hover:-translate-y-0.5 hover:from-blue-500 hover:to-indigo-500 active:scale-95"
                    >
                      Month View
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-3">
                    {weekDataWithEvents.map((day) => (
                      <DayColumn
                        key={day.id}
                        day={day}
                        lunchStatus={lunchStatusByDayId[day.id] ?? "unset"}
                        onClick={() => setSelectedDayId(day.id)}
                      />
                    ))}
                  </div>
                </Card>
              </section>
            </div>

            <div className="grid grid-cols-12 gap-4">
              <section className="col-span-6">
                <Card title="GROCERY LIST ✦">
                                    <div className="mb-2 flex items-center justify-between">
                    <div />
                    {groceries.some((i) => i.completed) && (
                      <button
                        onClick={() => clearChecked("grocery")}
                        className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm ring-1 ring-black/5 transition hover:bg-red-50 hover:text-red-600"
                      >
                        Clear Checked
                      </button>
                    )}
                  </div>
                  <div className="max-h-[220px] space-y-1 overflow-y-auto pr-1">{renderList(groceries, "grocery")}</div>
                </Card>
              </section>

              <section className="col-span-6">
                <Card title="TO-DO LIST ✦">
                                    <div className="mb-2 flex items-center justify-between">
                    <div />
                    {tasks.some((i) => i.completed) && (
                      <button
                        onClick={() => clearChecked("todo")}
                        className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm ring-1 ring-black/5 transition hover:bg-red-50 hover:text-red-600"
                      >
                        Clear Checked
                      </button>
                    )}
                  </div>
                  <div className="max-h-[220px] space-y-1 overflow-y-auto pr-1">{renderList(tasks, "todo")}</div>
                </Card>
              </section>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => openAddModal("grocery")}
                className="min-h-12 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(59,130,246,0.28)] transition hover:-translate-y-0.5 hover:from-blue-500 hover:to-indigo-500 active:scale-95"
              >
                + Grocery Item
              </button>
              <button
                onClick={() => openAddModal("todo")}
                className="min-h-12 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(59,130,246,0.28)] transition hover:-translate-y-0.5 hover:from-blue-500 hover:to-indigo-500 active:scale-95"
              >
                + To-Do Item
              </button>
            </div>

            <div className="grid grid-cols-12 gap-4">
              <section className="col-span-6">
                <Card title="LONG TERM PROJECTS ✦">
                                    <div className="mb-2 flex items-center justify-between">
                    <div />
                    {projects.some((i) => i.completed) && (
                      <button
                        onClick={() => clearChecked("project")}
                        className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm ring-1 ring-black/5 transition hover:bg-red-50 hover:text-red-600"
                      >
                        Clear Checked
                      </button>
                    )}
                  </div>
                  <div className="max-h-[220px] space-y-1 overflow-y-auto pr-1">{renderList(projects, "project")}</div>
                </Card>
              </section>

              <section className="col-span-6">
                <Card title="GIFT IDEAS ✦">
                                    <div className="mb-2 flex items-center justify-between">
                    <div />
                    {gifts.some((i) => i.completed) && (
                      <button
                        onClick={() => clearChecked("gift")}
                        className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm ring-1 ring-black/5 transition hover:bg-red-50 hover:text-red-600"
                      >
                        Clear Checked
                      </button>
                    )}
                  </div>
                  <div className="max-h-[220px] space-y-1 overflow-y-auto pr-1">{renderList(gifts, "gift")}</div>
                </Card>
              </section>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => openAddModal("project")}
                className="min-h-12 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(139,92,246,0.28)] transition hover:-translate-y-0.5 hover:from-violet-500 hover:to-fuchsia-500 active:scale-95"
              >
                + Long Term Project
              </button>
              <button
                onClick={() => openAddModal("gift")}
                className="min-h-12 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(139,92,246,0.28)] transition hover:-translate-y-0.5 hover:from-violet-500 hover:to-fuchsia-500 active:scale-95"
              >
                + Gift Idea
              </button>
            </div>
          </main>
        ) : (
          <MonthView
            monthDate={monthDate}
            weekData={weekDataWithEvents}
            calendarEventsByDate={calendarEventsByDate}
            monthLunchData={monthLunchData}
            bulkLunchEditMode={bulkLunchEditMode}
            onToggleBulkLunchEditMode={() => setBulkLunchEditMode((current) => !current)}
            onBack={() => {
              setBulkLunchEditMode(false);
              setAppView("dashboard");
            }}
            onPrevMonth={() => setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
            onNextMonth={() => setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
            onOpenDay={(isoDate) => {
              if (bulkLunchEditMode) return;
              setSelectedDayId(null);
              setSelectedMonthDate(isoDate);
            }}
            onSetLunch={updateMonthLunch}
          />
        )}
      </div>

      <AddItemModal
        open={addModalType !== null}
        title={addModalTitle}
        value={newItemName}
        onChange={setNewItemName}
        onClose={closeAddModal}
        onSubmit={submitAddModal}
        submitLabel="Add"
      />

      <DayDetailDrawer
        day={selectedDay}
        lunchStatus={selectedDayLunchStatus}
        open={Boolean(selectedDay) && !selectedMonthDate}
        onClose={() => setSelectedDayId(null)}
        onLunchChange={(value) => {
          if (selectedDay) updateLunchByIsoDate(selectedDay.isoDate, value);
        }}
      />

      <MonthLunchDrawer
        day={selectedMonthDay}
        events={selectedMonthDayEvents}
        open={Boolean(selectedMonthDay)}
        onClose={() => {
          setSelectedMonthDate(null);
          setSelectedDayId(null);
        }}
        onLunchChange={(value) => {
          if (selectedMonthDay) updateMonthLunch(selectedMonthDay.isoDate, value);
        }}
      />
    </div>
  );
}
