import { useState, useCallback, ReactNode } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FormFieldWrapper, fieldErrorClass } from "./form-field-wrapper";

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
  /**
   * Optional group header. When at least one option carries a group,
   * the dropdown renders one CommandGroup per distinct group (with
   * the group string as the heading) instead of a single flat list.
   * Falls back to "أخرى" / "Other" for options without a group when
   * mixed grouping is used.
   */
  group?: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  onCreateNew?: () => void;
  createNewLabel?: string;
  /**
   * Notifies the parent of the live search text typed in the dropdown.
   * Lets pickers with server-side search (#2134: the client picker only
   * preloads the first 500 rows) fetch matches the preloaded window
   * misses; cmdk still filters the merged options client-side.
   */
  onSearchChange?: (text: string) => void;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "اختر...",
  searchPlaceholder = "ابحث...",
  emptyText = "لا توجد نتائج",
  disabled,
  className,
  onCreateNew,
  createNewLabel = "إضافة جديد",
  onSearchChange,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal h-9",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} onValueChange={onSearchChange} />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>{emptyText}</CommandEmpty>
            {(() => {
              // Group if any option specifies a group. Without this
              // the import wizard's column-mapping dropdown was a
              // flat ~50-item list that overflowed the page (issue
              // #1870 §2). Grouped rendering keeps the dropdown
              // compact + scannable; the CommandInput still filters
              // across all groups together.
              const hasGroups = options.some((o) => o.group);
              if (!hasGroups) {
                return (
                  <CommandGroup>
                    {options.map(renderOption)}
                  </CommandGroup>
                );
              }
              const order: string[] = [];
              const byGroup: Record<string, SelectOption[]> = {};
              for (const opt of options) {
                const g = opt.group ?? "أخرى";
                if (!byGroup[g]) {
                  byGroup[g] = [];
                  order.push(g);
                }
                byGroup[g].push(opt);
              }
              return order.map((g) => (
                <CommandGroup key={g} heading={g}>
                  {byGroup[g].map(renderOption)}
                </CommandGroup>
              ));
            })()}
            {onCreateNew && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      setOpen(false);
                      onCreateNew();
                    }}
                    className="text-primary"
                  >
                    <Plus className="me-2 h-4 w-4" />
                    {createNewLabel}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );

  function renderOption(option: SelectOption) {
    return (
      <CommandItem
        key={option.value}
        value={option.label}
        onSelect={() => {
          onValueChange(option.value === value ? "" : option.value);
          setOpen(false);
        }}
      >
        <Check
          className={cn(
            "me-2 h-4 w-4",
            value === option.value ? "opacity-100" : "opacity-0"
          )}
        />
        <div className="flex flex-col">
          <span>{option.label}</span>
          {option.sublabel && (
            <span className="text-xs text-muted-foreground">{option.sublabel}</span>
          )}
        </div>
      </CommandItem>
    );
  }
}

interface SearchableSelectFieldProps extends SearchableSelectProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  fieldClassName?: string;
}

export function SearchableSelectField({
  label,
  required,
  error,
  hint,
  fieldClassName,
  className,
  ...selectProps
}: SearchableSelectFieldProps) {
  return (
    <FormFieldWrapper
      label={label}
      required={required}
      error={error}
      hint={hint}
      className={fieldClassName}
    >
      <SearchableSelect
        {...selectProps}
        className={cn(className, fieldErrorClass(error))}
      />
    </FormFieldWrapper>
  );
}

interface SelectFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function SelectField({
  label,
  required,
  error,
  hint,
  value,
  onValueChange,
  options,
  placeholder = "اختر...",
  disabled,
  className,
}: SelectFieldProps) {
  return (
    <SearchableSelectField
      label={label}
      required={required}
      error={error}
      hint={hint}
      options={options}
      value={value}
      onValueChange={onValueChange}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
    />
  );
}
