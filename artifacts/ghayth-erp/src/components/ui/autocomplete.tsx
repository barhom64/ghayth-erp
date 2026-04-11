import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X, Loader2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AutocompleteOption {
  value: string | number;
  label: string;
  subtitle?: string;
  metadata?: Record<string, any>;
}

interface AutocompleteProps {
  options: AutocompleteOption[];
  value?: string | number;
  onChange: (value: string | number, option?: AutocompleteOption) => void;
  onSelect?: (option: AutocompleteOption) => void;
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  emptyMessage?: string;
}

export function Autocomplete({
  options,
  value,
  onChange,
  onSelect,
  placeholder = "ابحث...",
  loading = false,
  disabled = false,
  className,
  emptyMessage = "لا توجد نتائج",
}: AutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((o) => String(o.value) === String(value));

  useEffect(() => {
    if (selectedOption && !isOpen) {
      setSearch("");
    }
  }, [selectedOption, isOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = search
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(search.toLowerCase()) ||
          o.subtitle?.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  const handleSelect = useCallback(
    (option: AutocompleteOption) => {
      onChange(option.value, option);
      onSelect?.(option);
      setSearch("");
      setIsOpen(false);
    },
    [onChange, onSelect]
  );

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("", undefined);
    setSearch("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
    }
    if (e.key === "Enter" && filtered.length === 1) {
      e.preventDefault();
      handleSelect(filtered[0]);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex items-center gap-2 border rounded-md px-3 py-2 bg-white transition-colors cursor-pointer",
          isOpen && "ring-2 ring-ring ring-offset-1",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        onClick={() => {
          if (!disabled) {
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 50);
          }
        }}
      >
        <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
        {isOpen ? (
          <input
            ref={inputRef}
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            placeholder={placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <span className={cn("flex-1 text-sm truncate", !selectedOption && "text-muted-foreground")}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        )}
        {loading && <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />}
        {value && !loading && (
          <button type="button" onClick={handleClear} className="text-gray-400 hover:text-gray-600">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {!value && !loading && <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyMessage}</div>
          ) : (
            filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "w-full text-start px-3 py-2 text-sm hover:bg-gray-50 transition-colors",
                  String(option.value) === String(value) && "bg-primary/5 text-primary"
                )}
                onClick={() => handleSelect(option)}
              >
                <div className="font-medium">{option.label}</div>
                {option.subtitle && <div className="text-xs text-muted-foreground mt-0.5">{option.subtitle}</div>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
