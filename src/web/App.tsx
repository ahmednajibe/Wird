import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { ApiError } from './client/client';
import { AddTaskProvider } from './components/AddTaskContext';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/ui/Toast';
import { ThemeProvider } from './lib/theme';
import { ImportPlanPage } from './pages/ImportPlan';
import { NotFoundPage } from './pages/NotFound';
import { PlanPage } from './pages/Plan';
import { QuranPage } from './pages/Quran';
import { ResourcesPage } from './pages/Resources';
import { SettingsPage } from './pages/Settings';
import { StatsPage } from './pages/Stats';
import { TodayPage } from './pages/Today';
import { TracksPage } from './pages/Tracks';

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: true,
        retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      },
    },
  });
}

export function App() {
  const [client] = useState(makeClient);
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <MotionConfig reducedMotion="user">
          <ToastProvider>
            <BrowserRouter>
              <AddTaskProvider>
                <Routes>
                  <Route element={<Layout />}>
                    <Route index element={<TodayPage />} />
                    <Route path="plan" element={<PlanPage />} />
                    <Route path="tracks" element={<TracksPage />} />
                    <Route path="quran" element={<QuranPage />} />
                    <Route path="stats" element={<StatsPage />} />
                    <Route path="resources" element={<ResourcesPage />} />
                    <Route path="import" element={<ImportPlanPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Routes>
              </AddTaskProvider>
            </BrowserRouter>
          </ToastProvider>
        </MotionConfig>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
