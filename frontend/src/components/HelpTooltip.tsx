import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, X } from 'lucide-react';
import { cn } from '../utils/cn';
import { useHelpStore, useShouldShowTooltip } from '../stores/helpStore';

interface HelpTooltipProps {
  id: string;
  title: string;
  description: string;
  children?: React.ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  trigger?: 'hover' | 'click' | 'focus';
  showIcon?: boolean;
  className?: string;
  onDismiss?: () => void;
}

export function HelpTooltip({
  id,
  title,
  description,
  children,
  placement = 'bottom',
  trigger = 'hover',
  showIcon = true,
  className,
  onDismiss,
}: HelpTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hasBeenSeen, setHasBeenSeen] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const { markTooltipSeen, tooltipsEnabled } = useHelpStore();
  const shouldShow = useShouldShowTooltip(id);

  // Auto-show on first encounter if not seen
  useEffect(() => {
    if (shouldShow && !hasBeenSeen) {
      const timer = setTimeout(() => {
        setIsVisible(true);
        setHasBeenSeen(true);
        markTooltipSeen(id);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [shouldShow, hasBeenSeen, id, markTooltipSeen]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsVisible(false);
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isVisible]);

  // Handle keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsVisible(false);
      }
    };

    if (isVisible) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isVisible]);

  const handleMouseEnter = () => {
    if (trigger === 'hover' && tooltipsEnabled) {
      setIsVisible(true);
    }
  };

  const handleMouseLeave = () => {
    if (trigger === 'hover') {
      setIsVisible(false);
    }
  };

  const handleClick = () => {
    if (trigger === 'click' && tooltipsEnabled) {
      setIsVisible(!isVisible);
    }
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsVisible(false);
    onDismiss?.();
  };

  // Calculate tooltip position
  const getTooltipStyles = () => {
    const baseStyles = 'absolute z-50 w-72 p-4 rounded-xl bg-card dark:bg-card-dark border border-border/50 dark:border-border-dark/50 shadow-xl backdrop-blur-xl';
    
    switch (placement) {
      case 'top':
        return { className: `${baseStyles} bottom-full left-1/2 -translate-x-1/2 mb-2`, arrow: 'bottom' };
      case 'bottom':
        return { className: `${baseStyles} top-full left-1/2 -translate-x-1/2 mt-2`, arrow: 'top' };
      case 'left':
        return { className: `${baseStyles} right-full top-1/2 -translate-y-1/2 mr-2`, arrow: 'right' };
      case 'right':
        return { className: `${baseStyles} left-full top-1/2 -translate-y-1/2 ml-2`, arrow: 'left' };
      default:
        return { className: `${baseStyles} top-full left-1/2 -translate-x-1/2 mt-2`, arrow: 'top' };
    }
  };

  const { className: tooltipClassName, arrow } = getTooltipStyles();

  const renderArrow = () => {
    const arrowClasses = 'absolute w-3 h-3 bg-card dark:bg-card-dark border-border/50 dark:border-border-dark/50 rotate-45';
    
    switch (arrow) {
      case 'top':
        return <div className={cn(arrowClasses, '-top-1.5 left-1/2 -translate-x-1/2 border-t border-l')} />;
      case 'bottom':
        return <div className={cn(arrowClasses, '-bottom-1.5 left-1/2 -translate-x-1/2 border-b border-r')} />;
      case 'left':
        return <div className={cn(arrowClasses, 'top-1/2 -left-1.5 -translate-y-1/2 border-l border-b')} />;
      case 'right':
        return <div className={cn(arrowClasses, 'top-1/2 -right-1.5 -translate-y-1/2 border-t border-r')} />;
      default:
        return null;
    }
  };

  return (
    <div
      ref={triggerRef}
      className={cn('relative inline-flex items-center gap-1', className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      data-help-tooltip={id}
    >
      {children}
      
      {showIcon && (
        <button
          type="button"
          className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            setIsVisible(!isVisible);
          }}
          aria-label={`Help: ${title}`}
        >
          <HelpCircle className="w-3 h-3" />
        </button>
      )}

      <AnimatePresence>
        {isVisible && tooltipsEnabled && (
          <motion.div
            ref={tooltipRef}
            initial={{ opacity: 0, scale: 0.95, y: arrow === 'top' ? -5 : 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: arrow === 'top' ? -5 : 5 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={tooltipClassName}
          >
            {renderArrow()}
            
            <div className="relative">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
                    <HelpCircle className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <h4 className="font-medium text-sm text-foreground dark:text-foreground-dark">
                    {title}
                  </h4>
                </div>
                <button
                  onClick={handleDismiss}
                  className="p-1 rounded hover:bg-muted dark:hover:bg-muted-dark transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground dark:text-muted-foreground-dark" />
                </button>
              </div>
              
              <p className="text-xs text-muted-foreground dark:text-muted-foreground-dark leading-relaxed">
                {description}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Simple inline help icon that shows tooltip on hover
export function InlineHelpIcon({
  title,
  description,
  className,
}: {
  title: string;
  description: string;
  className?: string;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const { tooltipsEnabled } = useHelpStore();

  if (!tooltipsEnabled) return null;

  return (
    <div
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      <HelpCircle className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors cursor-help" />
      
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-lg bg-card dark:bg-card-dark border border-border/50 dark:border-border-dark/50 shadow-lg backdrop-blur-xl z-50"
          >
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-card dark:bg-card-dark border-r border-b border-border/50 dark:border-border-dark/50 rotate-45" />
            <h5 className="font-medium text-xs text-foreground dark:text-foreground-dark mb-1">{title}</h5>
            <p className="text-xs text-muted-foreground dark:text-muted-foreground-dark">{description}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Help badge that appears on new features
export function FeatureDiscoveryBadge({
  featureId,
  featureName,
  className,
}: {
  featureId: string;
  featureName: string;
  className?: string;
}) {
  const { dismissBadge, dismissedBadges } = useHelpStore();
  const isDismissed = dismissedBadges.includes(featureId);

  if (isDismissed) return null;

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        'bg-gradient-to-r from-primary to-accent text-white',
        'shadow-lg shadow-primary/20',
        className
      )}
    >
      <span>New</span>
      <button
        onClick={() => dismissBadge(featureId)}
        className="ml-1 p-0.5 rounded-full hover:bg-white/20 transition-colors"
        aria-label={`Dismiss ${featureName} badge`}
      >
        <X className="w-3 h-3" />
      </button>
    </motion.span>
  );
}

// Keyboard shortcut hint component
export function KeyboardShortcutHint({
  shortcut,
  description,
  className,
}: {
  shortcut: string;
  description?: string;
  className?: string;
}) {
  const { showShortcutHints } = useHelpStore();

  if (!showShortcutHints) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs',
        'bg-muted dark:bg-muted-dark text-muted-foreground dark:text-muted-foreground-dark',
        'border border-border/50 dark:border-border-dark/50',
        className
      )}
      title={description}
    >
      <kbd className="font-mono font-medium">{shortcut}</kbd>
    </span>
  );
}
