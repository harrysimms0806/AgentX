import { motion, AnimatePresence } from 'framer-motion';
import { 
  Trash2, Play, Pause, X, CheckSquare, Square,
  Archive, Download, MoreHorizontal, ChevronDown
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { cn } from '../utils/cn';

interface BulkOperationsProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onDelete: () => void;
  onRun?: () => void;
  onPause?: () => void;
  onArchive?: () => void;
  onExport?: () => void;
  disabled?: boolean;
}

export function BulkOperations({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onDelete,
  onRun,
  onPause,
  onArchive,
  onExport,
  disabled = false,
}: BulkOperationsProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAllSelected = selectedCount === totalCount && totalCount > 0;
  const hasSelection = selectedCount > 0;

  return (
    <AnimatePresence>
      {hasSelection && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="flex items-center justify-between p-3 mb-4 rounded-xl bg-accent/5 border border-accent/20"
        >
          {/* Left: Selection Info */}
          <div className="flex items-center gap-3">
            <button
              onClick={isAllSelected ? onDeselectAll : onSelectAll}
              disabled={disabled}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-accent/10 transition-colors disabled:opacity-50"
            >
              {isAllSelected ? (
                <>
                  <CheckSquare className="w-4 h-4 text-accent" />
                  <span className="text-sm font-medium">Deselect all</span>
                </>
              ) : (
                <>
                  <Square className="w-4 h-4 text-foreground-secondary" />
                  <span className="text-sm font-medium">Select all {totalCount}</span>
                </>
              )}
            </button>

            <span className="text-sm text-foreground-secondary">
              {selectedCount} selected
            </span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Primary Actions */}
            {onRun && (
              <button
                onClick={onRun}
                disabled={disabled}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-500/20 transition-colors disabled:opacity-50 text-sm font-medium"
              >
                <Play className="w-4 h-4" />
                Run
              </button>
            )}

            {onPause && (
              <button
                onClick={onPause}
                disabled={disabled}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 transition-colors disabled:opacity-50 text-sm font-medium"
              >
                <Pause className="w-4 h-4" />
                Pause
              </button>
            )}

            {/* More Actions Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                disabled={disabled}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-background-secondary transition-colors disabled:opacity-50 text-sm"
              >
                <MoreHorizontal className="w-4 h-4" />
                <ChevronDown className={cn("w-3 h-3 transition-transform", showDropdown && "rotate-180")} />
              </button>

              <AnimatePresence>
                {showDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: 5, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 5, scale: 0.95 }}
                    className="absolute right-0 top-full mt-1 min-w-[160px] py-1 rounded-lg glass-card shadow-lg z-50"
                  >
                    {onArchive && (
                      <button
                        onClick={() => { onArchive(); setShowDropdown(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-background-secondary transition-colors text-left"
                      >
                        <Archive className="w-4 h-4 text-foreground-secondary" />
                        Archive
                      </button>
                    )}

                    {onExport && (
                      <button
                        onClick={() => { onExport(); setShowDropdown(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-background-secondary transition-colors text-left"
                      >
                        <Download className="w-4 h-4 text-foreground-secondary" />
                        Export
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-glass-border dark:bg-glass-border-dark" />

            {/* Delete Action */}
            <button
              onClick={onDelete}
              disabled={disabled}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors disabled:opacity-50 text-sm font-medium"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>

            {/* Close */}
            <button
              onClick={onDeselectAll}
              disabled={disabled}
              className="p-1.5 rounded-lg hover:bg-background-secondary transition-colors disabled:opacity-50"
              title="Clear selection"
            >
              <X className="w-4 h-4 text-foreground-secondary" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default BulkOperations;
