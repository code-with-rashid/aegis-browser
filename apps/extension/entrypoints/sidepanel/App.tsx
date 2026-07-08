import { Button } from '@/components/ui/button';

export default function App(): React.JSX.Element {
  return (
    <div className="flex h-full min-h-[400px] w-[360px] flex-col gap-3 bg-background p-4 text-foreground">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">Aegis</h1>
        <p className="text-sm text-muted-foreground">
          Local-first, BYOK browser automation. Scaffolding in progress.
        </p>
      </header>
      <Button>Get started</Button>
    </div>
  );
}
