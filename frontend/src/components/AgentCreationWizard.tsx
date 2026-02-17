import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronRight, ChevronLeft, Check, Bot, Settings, Shield, Sparkles,
  AlertCircle 
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { useAppStore } from '../../stores/appStore';

interface WizardStep {
  id: number;
  title: string;
  description: string;
  icon: React.ElementType;
}

const steps: WizardStep[] = [
  { id: 1, title: 'Basic Info', description: 'Name and type', icon: Bot },
  { id: 2, title: 'Provider', description: 'AI provider & model', icon: Settings },
  { id: 3, title: 'Capabilities', description: 'What it can do', icon: Sparkles },
  { id: 4, title: 'Permissions', description: 'Access control', icon: Shield },
];

const agentTypes = [
  { id: 'coordinator', name: 'Coordinator', description: 'Planning and coordination' },
  { id: 'builder', name: 'Builder', description: 'Code generation and development' },
  { id: 'local', name: 'Local', description: 'Fast local processing' },
  { id: 'cloud', name: 'Cloud', description: 'General purpose cloud agent' },
];

const providers = [
  { id: 'kimi', name: 'Kimi', models: ['kimi-coding/k2p5'] },
  { id: 'openai', name: 'OpenAI', models: ['codex', 'gpt-4', 'gpt-3.5-turbo'] },
  { id: 'ollama', name: 'Ollama (Local)', models: ['qwen2.5-coder:14b', 'llama3.2:3b'] },
];

const capabilities = [
  'read', 'write', 'exec', 'admin',
  'planning', 'code-generation', 'refactoring', 'debugging',
  'review', 'documentation', 'analysis', 'architecture'
];

export function AgentCreationWizard({ onClose, onComplete }: { onClose: () => void; onComplete: () => void }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const addAgent = useAppStore((state) => state.addAgent);

  const [formData, setFormData] = useState({
    name: '',
    displayName: '',
    type: 'builder',
    provider: 'openai',
    model: 'codex',
    capabilities: ['read', 'write'] as string[],
    description: '',
    policy: { allow: ['read', 'write'], deny: [] },
    avatar: '🤖',
  });

  const updateField = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError('');
  };

  const toggleCapability = (cap: string) => {
    setFormData((prev) => ({
      ...prev,
      capabilities: prev.capabilities.includes(cap)
        ? prev.capabilities.filter((c) => c !== cap)
        : [...prev.capabilities, cap],
    }));
  };

  const validateStep = () => {
    switch (currentStep) {
      case 1:
        if (!formData.name || formData.name.length < 2) {
          setError('Name must be at least 2 characters');
          return false;
        }
        return true;
      case 2:
        if (!formData.provider) {
          setError('Provider is required');
          return false;
        }
        return true;
      case 3:
        if (formData.capabilities.length === 0) {
          setError('Select at least one capability');
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep()) {
      setCurrentStep((prev) => Math.min(prev + 1, steps.length));
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    setError('');
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/agents/wizard/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Failed to create agent');
      }

      const result = await response.json();
      addAgent(result.data);
      onComplete();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Agent ID</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="my-agent"
                className="w-full input-apple"
              />
              <p className="text-xs text-foreground-secondary mt-1">
                Used in URLs and API calls. Lowercase, no spaces.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Display Name</label>
              <input
                type="text"
                value={formData.displayName}
                onChange={(e) => updateField('displayName', e.target.value)}
                placeholder="My Agent"
                className="w-full input-apple"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Agent Type</label>
              <div className="grid grid-cols-2 gap-2">
                {agentTypes.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => updateField('type', type.id)}
                    className={cn(
                      "p-3 rounded-lg border text-left transition-all",
                      formData.type === type.id
                        ? "border-accent bg-accent/10"
                        : "border-border hover:border-accent/50"
                    )}
                  >
                    <div className="font-medium">{type.name}</div>
                    <div className="text-xs text-foreground-secondary">{type.description}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Provider</label>
              <div className="space-y-2">
                {providers.map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => {
                      updateField('provider', provider.id);
                      updateField('model', provider.models[0]);
                    }}
                    className={cn(
                      "w-full p-3 rounded-lg border text-left transition-all",
                      formData.provider === provider.id
                        ? "border-accent bg-accent/10"
                        : "border-border hover:border-accent/50"
                    )}
                  >
                    <div className="font-medium">{provider.name}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Model</label>
              <select
                value={formData.model}
                onChange={(e) => updateField('model', e.target.value)}
                className="w-full input-apple"
              >
                {providers
                  .find((p) => p.id === formData.provider)
                  ?.models.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Capabilities</label>
              <div className="flex flex-wrap gap-2">
                {capabilities.map((cap) => (
                  <button
                    key={cap}
                    onClick={() => toggleCapability(cap)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm transition-all",
                      formData.capabilities.includes(cap)
                        ? "bg-accent text-white"
                        : "bg-background-secondary hover:bg-accent/20"
                    )}
                  >
                    {cap}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="What does this agent do?"
                rows={3}
                className="w-full input-apple resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Avatar</label>
              <div className="flex gap-2">
                {['🤖', '🧠', '🛠️', '💻', '👀', '✨', '🔧', '📊'].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => updateField('avatar', emoji)}
                    className={cn(
                      "w-10 h-10 rounded-lg text-xl transition-all",
                      formData.avatar === emoji
                        ? "bg-accent text-white"
                        : "bg-background-secondary hover:bg-accent/20"
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <div className="bg-background-secondary rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-foreground-secondary">ID</span>
                <span className="font-mono">{formData.name || 'Not set'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-foreground-secondary">Type</span>
                <span>{formData.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-foreground-secondary">Provider</span>
                <span>{formData.provider}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-foreground-secondary">Model</span>
                <span>{formData.model}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-foreground-secondary">Capabilities</span>
                <span>{formData.capabilities.length} selected</span>
              </div>
            </div>
            <div className="bg-accent/10 border border-accent/20 rounded-lg p-4">
              <div className="flex items-center gap-2 text-accent mb-2">
                <Sparkles className="w-4 h-4" />
                <span className="font-medium">Ready to Create</span>
              </div>
              <p className="text-sm text-foreground-secondary">
                Your agent will be created with the settings above. You can modify these later in Settings.
              </p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-background dark:bg-background-dark rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden"
      >
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Create New Agent</h2>
            <button onClick={onClose} className="text-foreground-secondary hover:text-foreground">
              ×
            </button>
          </div>
          <div className="flex gap-2">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              const isActive = currentStep === step.id;
              const isComplete = currentStep > step.id;
              
              return (
                <div
                  key={step.id}
                  className={cn(
                    "flex-1 flex items-center gap-2 p-2 rounded-lg transition-all",
                    isActive && "bg-accent/10",
                    isComplete && "opacity-60"
                  )}
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                      isActive && "bg-accent text-white",
                      isComplete && "bg-green-500 text-white",
                      !isActive && !isComplete && "bg-background-secondary"
                    )}
                  >
                    {isComplete ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <div className="hidden sm:block">
                    <div className="text-xs font-medium">{step.title}</div>
                    <div className="text-[10px] text-foreground-secondary">{step.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[50vh]">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-500 text-sm"
            >
              <AlertCircle className="w-4 h-4" />
              {error}
            </motion.div>
          )}
        </div>

        <div className="p-6 border-t border-border flex justify-between">
          <button
            onClick={handleBack}
            disabled={currentStep === 1}
            className={cn(
              "btn-apple-secondary flex items-center gap-2",
              currentStep === 1 && "opacity-50 cursor-not-allowed"
            )}
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          {currentStep === steps.length ? (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="btn-apple flex items-center gap-2"
            >
              {isSubmitting ? 'Creating...' : 'Create Agent'}
              <Check className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="btn-apple flex items-center gap-2"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default AgentCreationWizard;
