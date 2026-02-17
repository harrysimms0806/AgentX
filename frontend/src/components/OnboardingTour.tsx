import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, Sparkles, Keyboard } from 'lucide-react';
import { cn } from '../utils/cn';
import { useOnboardingStore, tourSteps } from '../stores/onboardingStore';
import { useNavigate, useLocation } from 'react-router-dom';

interface SpotlightPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function OnboardingTour() {
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    isTourActive, 
    currentStep, 
    hasCompletedTour,
    nextStep, 
    prevStep, 
    skipTour, 
    completeTour,
    setTourActive 
  } = useOnboardingStore();
  
  const [spotlight, setSpotlight] = useState<SpotlightPosition | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [isNavigating, setIsNavigating] = useState(false);
  const stepStartTime = useRef(Date.now());

  const step = tourSteps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === tourSteps.length - 1;
  const progress = ((currentStep + 1) / tourSteps.length) * 100;

  // Auto-start tour for first-time users
  useEffect(() => {
    if (!hasCompletedTour && !isTourActive) {
      const timer = setTimeout(() => {
        setTourActive(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [hasCompletedTour, isTourActive, setTourActive]);

  // Navigation logic for tour steps
  useEffect(() => {
    if (!isTourActive) return;
    
    const routeMap: Record<string, string> = {
      'agents': '/agents',
      'workflows': '/workflows',
    };

    const targetRoute = routeMap[step.id];
    if (targetRoute && location.pathname !== targetRoute && !isNavigating) {
      setIsNavigating(true);
      navigate(targetRoute);
      setTimeout(() => setIsNavigating(false), 300);
    }
  }, [currentStep, isTourActive, location.pathname, navigate, step.id, isNavigating]);

  // Calculate spotlight position
  const calculateSpotlight = useCallback(() => {
    if (step.targetSelector === 'body') {
      // Center spotlight for body targets
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      setSpotlight({
        top: centerY - 100,
        left: centerX - 150,
        width: 300,
        height: 200,
      });
      return;
    }

    const element = document.querySelector(step.targetSelector);
    if (element) {
      const rect = element.getBoundingClientRect();
      const padding = 8;
      setSpotlight({
        top: rect.top - padding,
        left: rect.left - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      });
    } else {
      // Fallback to center if element not found
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      setSpotlight({
        top: centerY - 100,
        left: centerX - 150,
        width: 300,
        height: 200,
      });
    }
  }, [step.targetSelector]);

  // Calculate tooltip position
  const calculateTooltipPosition = useCallback(() => {
    if (!spotlight) return;

    const tooltipWidth = 384; // w-96
    const tooltipHeight = 200; // approximate
    const gap = 16;
    const position = step.position || 'bottom';

    let top = spotlight.top;
    let left = spotlight.left + spotlight.width / 2 - tooltipWidth / 2;

    switch (position) {
      case 'top':
        top = spotlight.top - tooltipHeight - gap;
        break;
      case 'bottom':
        top = spotlight.top + spotlight.height + gap;
        break;
      case 'left':
        left = spotlight.left - tooltipWidth - gap;
        top = spotlight.top + spotlight.height / 2 - tooltipHeight / 2;
        break;
      case 'right':
        left = spotlight.left + spotlight.width + gap;
        top = spotlight.top + spotlight.height / 2 - tooltipHeight / 2;
        break;
    }

    // Keep tooltip within viewport
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));
    top = Math.max(16, Math.min(top, window.innerHeight - tooltipHeight - 16));

    setTooltipPosition({ top, left });
  }, [spotlight, step.position]);

  // Update positions on mount and resize
  useEffect(() => {
    if (!isTourActive) return;

    calculateSpotlight();
    
    const handleResize = () => {
      calculateSpotlight();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isTourActive, calculateSpotlight]);

  // Update tooltip position when spotlight changes
  useEffect(() => {
    calculateTooltipPosition();
  }, [spotlight, calculateTooltipPosition]);

  // Track step duration for analytics (optional)
  useEffect(() => {
    stepStartTime.current = Date.now();
  }, [currentStep]);

  if (!isTourActive) return null;

  return (
    <AnimatePresence mode="wait">
      <div className="fixed inset-0 z-[100]" key="tour-overlay">
        {/* Dark overlay with spotlight cutout */}
        <svg 
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: 'none' }}
        >
          <defs>
            <mask id="spotlight-mask">
              <rect width="100%" height="100%" fill="white" />
              {spotlight && (
                <rect
                  x={spotlight.left}
                  y={spotlight.top}
                  width={spotlight.width}
                  height={spotlight.height}
                  rx={12}
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(0, 0, 0, 0.75)"
            mask="url(#spotlight-mask)"
            style={{ pointerEvents: 'auto' }}
            onClick={() => {}}
          />
        </svg>

        {/* Spotlight border glow */}
        {spotlight && step.targetSelector !== 'body' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="absolute rounded-xl border-2 border-primary/50 shadow-[0_0_30px_rgba(var(--color-primary-rgb),0.3)]"
            style={{
              top: spotlight.top,
              left: spotlight.left,
              width: spotlight.width,
              height: spotlight.height,
            }}
          >
            {/* Pulsing animation */}
            <motion.div
              className="absolute inset-0 rounded-xl border-2 border-primary/30"
              animate={{
                scale: [1, 1.05, 1],
                opacity: [0.5, 0.8, 0.5],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          </motion.div>
        )}

        {/* Tooltip */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className={cn(
            "absolute w-96 bg-card dark:bg-card-dark rounded-2xl shadow-2xl",
            "border border-border/50 dark:border-border-dark/50",
            "backdrop-blur-xl overflow-hidden"
          )}
          style={{
            top: tooltipPosition.top,
            left: tooltipPosition.left,
          }}
        >
          {/* Progress bar */}
          <div className="h-1 bg-muted dark:bg-muted-dark">
            <motion.div
              className="h-full bg-gradient-to-r from-primary to-accent"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border/50 dark:border-border-dark/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-medium text-muted-foreground dark:text-muted-foreground-dark">
                Step {currentStep + 1} of {tourSteps.length}
              </span>
            </div>
            <button
              onClick={skipTour}
              className="p-2 rounded-lg hover:bg-muted dark:hover:bg-muted-dark transition-colors"
              aria-label="Close tour"
            >
              <X className="w-4 h-4 text-muted-foreground dark:text-muted-foreground-dark" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            <motion.h3
              key={`title-${currentStep}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="text-xl font-semibold text-foreground dark:text-foreground-dark mb-2"
            >
              {step.title}
            </motion.h3>
            
            <motion.p
              key={`desc-${currentStep}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 }}
              className="text-sm text-muted-foreground dark:text-muted-foreground-dark leading-relaxed"
            >
              {step.description}
            </motion.p>

            {/* Keyboard shortcut hint */}
            {(step.id === 'command-palette' || step.id === 'keyboard-shortcuts' || step.id === 'theme') && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-4 flex items-center gap-2 p-3 rounded-lg bg-muted/50 dark:bg-muted-dark/50"
              >
                <Keyboard className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground dark:text-muted-foreground-dark">
                  {step.id === 'command-palette' && 'Press ⌘+K anytime'}
                  {step.id === 'keyboard-shortcuts' && 'Press ? for all shortcuts'}
                  {step.id === 'theme' && 'Press ⌘+⇧+L to toggle'}
                </span>
              </motion.div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-border/50 dark:border-border-dark/50 bg-muted/30 dark:bg-muted-dark/30">
            <button
              onClick={prevStep}
              disabled={isFirstStep}
              className={cn(
                "flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                isFirstStep
                  ? "text-muted-foreground/50 cursor-not-allowed"
                  : "text-muted-foreground dark:text-muted-foreground-dark hover:bg-muted dark:hover:bg-muted-dark"
              )}
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>

            <div className="flex items-center gap-2">
              {!isLastStep && (
                <button
                  onClick={skipTour}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground dark:text-muted-foreground-dark hover:bg-muted dark:hover:bg-muted-dark transition-colors"
                >
                  Skip
                </button>
              )}
              <button
                onClick={isLastStep ? completeTour : nextStep}
                className={cn(
                  "flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  isLastStep
                    ? "bg-green-500 hover:bg-green-600 text-white"
                    : "bg-primary hover:bg-primary/90 text-white"
                )}
              >
                {isLastStep ? 'Get Started' : 'Next'}
                {!isLastStep && <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </motion.div>

        {/* Step indicators */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2">
          {tourSteps.map((_, index) => (
            <button
              key={index}
              onClick={() => useOnboardingStore.getState().setCurrentStep(index)}
              className={cn(
                "w-2 h-2 rounded-full transition-all duration-300",
                index === currentStep
                  ? "w-6 bg-primary"
                  : index < currentStep
                    ? "bg-primary/50"
                    : "bg-white/20 hover:bg-white/40"
              )}
              aria-label={`Go to step ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </AnimatePresence>
  );
}

// Hook to mark elements for tour targeting
export function useTourTarget(id: string) {
  return {
    'data-tour': id,
  };
}
