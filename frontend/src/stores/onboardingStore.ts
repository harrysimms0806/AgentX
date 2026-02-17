import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface TourStep {
  id: string;
  title: string;
  description: string;
  targetSelector: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const tourSteps: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to AgentX',
    description: 'Your universal AI agent management platform. Let\'s take a quick tour to get you started.',
    targetSelector: 'body',
    position: 'bottom',
  },
  {
    id: 'sidebar',
    title: 'Navigation Sidebar',
    description: 'Access all sections of AgentX from here. Use G + key shortcuts for quick navigation (G then D for Dashboard).',
    targetSelector: '[data-tour="sidebar"]',
    position: 'right',
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'Get a bird\'s-eye view of your agents, tasks, and system health. Real-time activity feed shows everything happening.',
    targetSelector: '[data-tour="dashboard-stats"]',
    position: 'bottom',
  },
  {
    id: 'agents',
    title: 'Manage Agents',
    description: 'View and control your AI agents. See their status, capabilities, and current tasks at a glance.',
    targetSelector: '[data-tour="agents-page"]',
    position: 'right',
  },
  {
    id: 'workflows',
    title: 'Visual Workflow Builder',
    description: 'Create powerful automated workflows with our drag-and-drop builder. Connect triggers, agents, and actions.',
    targetSelector: '[data-tour="workflows-page"]',
    position: 'right',
  },
  {
    id: 'command-palette',
    title: 'Command Palette',
    description: 'Press ⌘+K (or Ctrl+K) to open the command palette. Search, navigate, and execute commands instantly.',
    targetSelector: 'body',
    position: 'bottom',
  },
  {
    id: 'keyboard-shortcuts',
    title: 'Keyboard Shortcuts',
    description: 'Press ? anytime to see all keyboard shortcuts. Navigate entirely without your mouse!',
    targetSelector: 'body',
    position: 'bottom',
  },
  {
    id: 'theme',
    title: 'Theme Toggle',
    description: 'Press ⌘+⇧+L to cycle through Light, Dark, and System themes. Your preference is saved automatically.',
    targetSelector: 'body',
    position: 'bottom',
  },
  {
    id: 'complete',
    title: 'You\'re All Set!',
    description: 'AgentX is ready to use. Start by creating your first agent or explore the settings to customize your experience.',
    targetSelector: 'body',
    position: 'bottom',
  },
];

interface OnboardingState {
  hasCompletedTour: boolean;
  isTourActive: boolean;
  currentStep: number;
  setTourActive: (active: boolean) => void;
  setCurrentStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  completeTour: () => void;
  resetTour: () => void;
  skipTour: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      hasCompletedTour: false,
      isTourActive: false,
      currentStep: 0,
      
      setTourActive: (active) => set({ isTourActive: active }),
      
      setCurrentStep: (step) => set({ currentStep: step }),
      
      nextStep: () => {
        const { currentStep } = get();
        if (currentStep < tourSteps.length - 1) {
          set({ currentStep: currentStep + 1 });
        } else {
          get().completeTour();
        }
      },
      
      prevStep: () => {
        const { currentStep } = get();
        if (currentStep > 0) {
          set({ currentStep: currentStep - 1 });
        }
      },
      
      completeTour: () => set({ 
        hasCompletedTour: true, 
        isTourActive: false, 
        currentStep: 0 
      }),
      
      resetTour: () => set({ 
        hasCompletedTour: false, 
        isTourActive: true, 
        currentStep: 0 
      }),
      
      skipTour: () => set({ 
        isTourActive: false, 
        currentStep: 0 
      }),
    }),
    {
      name: 'agentx-onboarding',
      partialize: (state) => ({ 
        hasCompletedTour: state.hasCompletedTour 
      }),
    }
  )
);
