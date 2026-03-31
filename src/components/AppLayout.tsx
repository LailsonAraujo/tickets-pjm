import { ReactNode, useEffect } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MouseGlow } from '@/components/MouseGlow';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <MouseGlow />
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-12 flex items-center border-b border-border px-4">
            <SidebarTrigger />
            <span className="ml-3 text-xs font-mono text-muted-foreground">PJM Net — N2/N3</span>
          </header>
          <main className="flex-1 p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
