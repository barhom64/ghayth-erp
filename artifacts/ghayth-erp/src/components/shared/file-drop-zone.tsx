import { useState, useRef, useCallback } from "react";
import { Upload, FileIcon, Trash2, Paperclip } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface Attachment {
  name: string;
  size: number;
  type: string;
  dataUrl: string;
}

interface FileDropZoneProps {
  files: Attachment[];
  onFilesChange: (files: Attachment[]) => void;
  label?: string;
  maxSizeMB?: number;
}

export function FileDropZone({ files, onFilesChange, label = "المرفقات", maxSizeMB = 5 }: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const maxBytes = maxSizeMB * 1024 * 1024;

  const processFiles = useCallback((fileList: FileList) => {
    const newFiles: Attachment[] = [];
    const validFiles = Array.from(fileList).filter(f => f.size <= maxBytes);
    let processed = 0;
    if (validFiles.length === 0) return;
    validFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        newFiles.push({
          name: file.name,
          size: file.size,
          type: file.type,
          dataUrl: reader.result as string,
        });
        processed++;
        if (processed === validFiles.length) {
          onFilesChange([...files, ...newFiles]);
        }
      };
      reader.readAsDataURL(file);
    });
  }, [files, onFilesChange, maxBytes]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  }, [processFiles]);

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <Paperclip className="h-3.5 w-3.5" />
        {label}
      </Label>
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all",
          isDragging
            ? "border-blue-400 bg-blue-50"
            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
        )}
      >
        <Upload className={cn("h-8 w-8 mx-auto mb-2", isDragging ? "text-blue-500" : "text-gray-300")} />
        <p className="text-sm text-gray-500">
          {isDragging ? "أفلت الملفات هنا" : "اسحب الملفات هنا أو انقر للاختيار"}
        </p>
        <p className="text-xs text-gray-400 mt-1">الحد الأقصى {maxSizeMB} ميجابايت لكل ملف</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) processFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((file, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border text-sm">
              <FileIcon className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <span className="flex-1 truncate">{file.name}</span>
              <span className="text-xs text-gray-400 flex-shrink-0">{formatSize(file.size)}</span>
              <button onClick={(e) => { e.stopPropagation(); removeFile(i); }} className="text-red-400 hover:text-red-600">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
