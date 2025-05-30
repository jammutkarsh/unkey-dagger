import { KeyboardButton } from "@/components/keyboard-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { processTimeFilters } from "@/lib/utils";
import { Button, DateTime, type Range, type TimeUnit } from "@unkey/ui";
import { type PropsWithChildren, useEffect, useState } from "react";
import { CUSTOM_OPTION_ID, DEFAULT_OPTIONS } from "./constants";
import { DateTimeSuggestions } from "./suggestions";
import type { OptionsType } from "./types";

const CUSTOM_PLACEHOLDER = "Custom";

interface DatetimePopoverProps extends PropsWithChildren {
  initialTitle: string;
  initialTimeValues: { startTime?: number; endTime?: number; since?: string };
  onSuggestionChange: (title: string) => void;
  onDateTimeChange: (startTime?: number, endTime?: number, since?: string) => void;
  customOptions?: OptionsType; // Add this to accept custom options
}

type TimeRangeType = {
  startTime?: number;
  endTime?: number;
};

export const DatetimePopover = ({
  children,
  initialTitle,
  initialTimeValues,
  onSuggestionChange,
  onDateTimeChange,
  customOptions, // Accept custom options
}: DatetimePopoverProps) => {
  const [open, setOpen] = useState(false);
  useKeyboardShortcut("t", () => setOpen((prev) => !prev));

  const { startTime, since, endTime } = initialTimeValues;
  const [time, setTime] = useState<TimeRangeType>({ startTime, endTime });
  const [lastAppliedTime, setLastAppliedTime] = useState<{
    startTime?: number;
    endTime?: number;
  }>({ startTime, endTime });

  // Use customOptions if provided, otherwise use DEFAULT_OPTIONS
  const OPTIONS = customOptions || DEFAULT_OPTIONS;
  // Find the custom option ID in the provided options
  const CURRENT_CUSTOM_OPTION_ID = customOptions
    ? customOptions.find((o) => o.value === undefined)?.id || CUSTOM_OPTION_ID
    : CUSTOM_OPTION_ID;

  const [suggestions, setSuggestions] = useState<OptionsType>(() => {
    const matchingSuggestion = since
      ? OPTIONS.find((s) => s.value === since)
      : startTime
        ? OPTIONS.find((s) => s.id === CURRENT_CUSTOM_OPTION_ID)
        : null;

    return OPTIONS.map((s) => ({
      ...s,
      checked: s.id === matchingSuggestion?.id,
    }));
  });

  useEffect(() => {
    const newTitle = since
      ? (OPTIONS.find((s) => s.value === since)?.display ?? CUSTOM_PLACEHOLDER)
      : startTime
        ? CUSTOM_PLACEHOLDER
        : initialTitle;

    onSuggestionChange(newTitle);
  }, [since, startTime, initialTitle, onSuggestionChange, OPTIONS]);

  const handleSuggestionChange = (id: number) => {
    if (id === CURRENT_CUSTOM_OPTION_ID) {
      return;
    }

    const newSuggestions = suggestions.map((s) => ({
      ...s,
      checked: s.id === id && !s.checked,
    }));
    setSuggestions(newSuggestions);

    const selectedValue = newSuggestions.find((s) => s.checked)?.value;
    onDateTimeChange(undefined, undefined, selectedValue);
  };

  const handleDateTimeChange = (newRange?: Range, newStart?: TimeUnit, newEnd?: TimeUnit) => {
    setSuggestions(
      suggestions.map((s) => ({
        ...s,
        checked: s.id === CURRENT_CUSTOM_OPTION_ID,
      })),
    );

    setTime({
      startTime: processTimeFilters(newRange?.from, newStart)?.getTime(),
      endTime: processTimeFilters(newRange?.to, newEnd)?.getTime(),
    });
  };

  const isTimeChanged =
    time.startTime !== lastAppliedTime.startTime || time.endTime !== lastAppliedTime.endTime;

  const handleApplyFilter = () => {
    if (!isTimeChanged) {
      setOpen(false);
      return;
    }

    onDateTimeChange(time.startTime, time.endTime);
    setLastAppliedTime({ startTime: time.startTime, endTime: time.endTime });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="flex flex-row items-center">{children}</div>
      </PopoverTrigger>
      <PopoverContent
        className="flex w-full p-0 m-0 rounded-lg shadow-2xl bg-gray-1 dark:bg-black border-gray-6"
        align="start"
      >
        <div className="flex flex-col w-60 px-1.5 py-3 m-0 border-r border-gray-4">
          <PopoverHeader />
          <DateTimeSuggestions options={suggestions} onChange={handleSuggestionChange} />
        </div>
        <DateTime
          onChange={handleDateTimeChange}
          initialRange={{
            from: startTime ? new Date(startTime) : undefined,
            to: endTime ? new Date(endTime) : undefined,
          }}
          className="h-full gap-3"
        >
          <DateTime.Calendar
            mode="range"
            className="px-3 pt-2.5 pb-3.5 border-b border-gray-4 text-[13px]"
          />
          <DateTime.TimeInput type="range" className="px-3.5 h-9 mt-0" />
          <DateTime.Actions className="px-3.5 h-full pb-4">
            <Button
              variant="primary"
              className="w-full font-sans rounded-md h-9"
              onClick={handleApplyFilter}
              disabled={!isTimeChanged}
            >
              Apply Filter
            </Button>
          </DateTime.Actions>
        </DateTime>
      </PopoverContent>
    </Popover>
  );
};

const PopoverHeader = () => {
  return (
    <div className="flex justify-between w-full h-8 px-2">
      <span className="text-gray-9 text-[13px] w-full">Filter by time range</span>
      <KeyboardButton shortcut="T" className="w-5 h-5 p-0 m-0 min-w-5" />
    </div>
  );
};
