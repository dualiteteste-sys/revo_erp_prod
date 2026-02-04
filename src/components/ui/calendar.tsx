"use client"

import * as React from "react"
import { DayPicker } from "react-day-picker"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>
export type CalendarWithMonthYearProps = CalendarProps & {
  onMonthYearOpenChange?: (open: boolean) => void
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function getMonthLabel(monthIndex: number) {
  const formatter = new Intl.DateTimeFormat("pt-BR", { month: "short" })
  const label = formatter.format(new Date(2026, monthIndex, 1)).replace(".", "")
  return label.charAt(0).toUpperCase() + label.slice(1)
}

	function Calendar({
	  className,
	  classNames,
	  showOutsideDays = true,
	  onMonthYearOpenChange,
	  ...props
	}: CalendarWithMonthYearProps) {
	  const [internalMonth, setInternalMonth] = React.useState<Date>(() => {
	    const selected = (props as any).selected;
	    const initial =
	      props.month ??
	      (selected instanceof Date ? selected : undefined) ??
	      props.defaultMonth ??
	      new Date()
	    return startOfMonth(initial)
	  })

  const displayedMonth = props.month ? startOfMonth(props.month) : internalMonth

  const [monthYearOpen, setMonthYearOpen] = React.useState(false)
  const [pickerYear, setPickerYear] = React.useState(displayedMonth.getFullYear())
  const [pickerMonth, setPickerMonth] = React.useState(displayedMonth.getMonth())

  React.useEffect(() => {
    setPickerYear(displayedMonth.getFullYear())
    setPickerMonth(displayedMonth.getMonth())
  }, [displayedMonth])

  React.useEffect(() => {
    if (pickerYear < 2025) setPickerYear(2025)
  }, [pickerYear])

  React.useEffect(() => {
    onMonthYearOpenChange?.(monthYearOpen)
  }, [monthYearOpen, onMonthYearOpenChange])

  const handleMonthChange = React.useCallback(
    (next: Date) => {
      const normalized = startOfMonth(next)
      if (!props.month) setInternalMonth(normalized)
      props.onMonthChange?.(normalized)
    },
    [props]
  )

  const years = React.useMemo(() => {
    const min = 2025
    const start = Math.max(min, pickerYear - 1) // 1 anterior, 1 atual, 6 posteriores = 8 anos
    const list = Array.from({ length: 8 }, (_, idx) => start + idx)
    return { list, min, start, end: start + 7 }
  }, [pickerYear])

  const setMonthYearOpenSafe = React.useCallback((open: boolean | ((prev: boolean) => boolean)) => {
    setMonthYearOpen((prev) => (typeof open === "function" ? open(prev) : open))
  }, [])

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("h-full p-3", className)}
      {...props}
      classNames={{
        // v9+ UI keys (https://daypicker.dev/docs/styling)
        months: "flex flex-col sm:flex-row gap-4",
        month: "space-y-3",
        month_caption: "relative grid grid-cols-[auto_auto_auto] items-center justify-center gap-2 py-2",
        caption_label: "col-start-2 row-start-1 text-center text-base font-semibold capitalize tracking-tight",
        nav: "contents",
        chevron: "h-5 w-5",
        button_previous: cn(
          buttonVariants({ variant: "ghost" }),
          "col-start-1 row-start-1 h-10 w-10 justify-self-start rounded-full border border-gray-200 bg-white/80 p-0 shadow-sm transition-all hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 hover:shadow focus-visible:ring-2 focus-visible:ring-blue-300/50"
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost" }),
          "col-start-3 row-start-1 h-10 w-10 justify-self-end rounded-full border border-gray-200 bg-white/80 p-0 shadow-sm transition-all hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 hover:shadow focus-visible:ring-2 focus-visible:ring-blue-300/50"
        ),
        month_grid: cn("w-full border-collapse", monthYearOpen && "opacity-0 pointer-events-none select-none"),
        weekdays: cn("flex", monthYearOpen && "opacity-0 pointer-events-none select-none"),
        weekday: "text-muted-foreground rounded-md w-9 font-medium text-[0.8rem] text-center",
        weeks: "flex flex-col w-full",
        week: "flex w-full mt-2",
        day: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected])]:bg-accent [&:has([aria-selected])]:rounded-md focus-within:relative focus-within:z-20",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
        ),
        selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground shadow-sm",
        today: "bg-accent text-accent-foreground ring-1 ring-inset ring-primary/20",
        outside: "text-muted-foreground opacity-50",
        disabled: "text-muted-foreground opacity-50",
        range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        hidden: "invisible",
        ...classNames,
      }}
      month={displayedMonth}
      onMonthChange={handleMonthChange}
      components={{
        ...(props.components ?? {}),
        Root: ({ children, ...rootProps }) => {
          const { rootRef, ...rest } = rootProps as any;
          return (
            <div ref={rootRef} {...rest} className={cn("relative h-full", rest.className)}>
            {children}
            <AnimatePresence initial={false}>
              {monthYearOpen ? (
                <motion.div
                  initial={{ opacity: 0, x: 24, scale: 0.96 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -24, scale: 0.96 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="absolute inset-0 z-20 rounded-2xl bg-white p-4 shadow-lg"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-base font-semibold text-gray-900">Selecionar mês e ano</div>
                    <button
                      type="button"
                      onClick={() => setMonthYearOpenSafe(false)}
                      className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                    >
                      Fechar
                    </button>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-700">Anos</div>
                    <div className="text-sm text-gray-500">
                      {years.start}–{years.end}
                    </div>
                  </div>

                  <div className="mt-2 rounded-2xl border border-gray-200 bg-white p-2">
                    <div className="grid grid-cols-4 gap-2">
                      {years.list.map((y) => {
                        const active = y === pickerYear
                        return (
                          <button
                            key={y}
                            type="button"
                            onClick={() => setPickerYear(y)}
                            className={cn(
                              "rounded-xl px-2 py-2 text-sm font-semibold transition-all",
                              active
                                ? "bg-blue-600 text-white shadow-sm"
                                : "bg-white text-gray-700 hover:bg-blue-50 hover:text-blue-700"
                            )}
                          >
                            {y}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="mt-4 text-sm font-semibold text-gray-700">Meses</div>

                  <div className="mt-2 rounded-2xl border border-gray-200 bg-white p-2">
                    <div className="grid grid-cols-4 gap-2">
                      {Array.from({ length: 12 }).map((_, idx) => {
                        const active = idx === pickerMonth
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setPickerMonth(idx)
                              handleMonthChange(new Date(pickerYear, idx, 1))
                              setMonthYearOpenSafe(false)
                            }}
                            className={cn(
                              "rounded-xl px-2 py-2 text-sm font-medium transition-all",
                              active
                                ? "bg-blue-600 text-white shadow-sm"
                                : "bg-white text-gray-700 hover:bg-blue-50 hover:text-blue-700"
                            )}
                          >
                            {getMonthLabel(idx)}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
            </div>
          );
        },
        CaptionLabel: ({ children, ...labelProps }) => (
          <button
            type="button"
            {...labelProps}
            onClick={(e) => {
              labelProps.onClick?.(e as any)
              setMonthYearOpenSafe((prev) => !prev)
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded-xl px-2 py-1 transition-colors hover:bg-blue-50 hover:text-blue-700",
              labelProps.className
            )}
          >
            <span>{children}</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", monthYearOpen && "rotate-180")} />
          </button>
        ),
      }}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
