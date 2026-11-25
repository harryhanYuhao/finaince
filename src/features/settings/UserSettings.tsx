'use client';

import { useState } from 'react';
import { UserCog } from 'lucide-react';
import { Dialog, Field, IconButton, Segmented } from '@/components/ui';
import { autoRootPx, usePrefs } from '@/state/prefs';

/**
 * Personal preferences that apply to the whole site (design/06 §10): theme, interface size and the
 * up/down colour convention. Chart-specific settings live in the chart's own settings panel.
 */
export function UserSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const prefs = usePrefs();
  const auto = autoRootPx();
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="User settings" description="Saved on this device and used on every page.">
      <div className="space-y-5">
        <Field label="Theme">
          <Segmented
            label="Theme"
            value={prefs.theme}
            onChange={prefs.setTheme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Field>
        <Field
          label="Interface size"
          hint={prefs.uiScale === 'auto' ? `Auto: ${auto === 16 ? 'normal' : auto === 18 ? 'large' : 'extra large'} for this screen. Browser zoom (Ctrl +/−) also works.` : 'Browser zoom (Ctrl +/−) also works.'}
          info="Scales buttons, icons, text and chart labels together. Auto enlarges the interface on high-resolution screens running at 100% display scaling."
        >
          <Segmented
            label="Interface size"
            value={prefs.uiScale}
            onChange={prefs.setUiScale}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'small', label: 'S', title: 'Small' },
              { value: 'normal', label: 'M', title: 'Normal' },
              { value: 'large', label: 'L', title: 'Large' },
              { value: 'xlarge', label: 'XL', title: 'Extra large' },
            ]}
          />
        </Field>
        <Field label="Up / down colours" hint="Red up is the convention in mainland China, Japan and Korea.">
          <Segmented
            label="Colour convention"
            value={prefs.colorConvention}
            onChange={prefs.setColorConvention}
            options={[
              { value: 'greenUp', label: 'Green up' },
              { value: 'redUp', label: 'Red up' },
              { value: 'mono', label: 'Mono' },
            ]}
          />
        </Field>
      </div>
    </Dialog>
  );
}

/** Icon button that opens the user settings. */
export function UserSettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton label="User settings" onClick={() => setOpen(true)}>
        <UserCog className="size-[1rem]" />
      </IconButton>
      <UserSettingsDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
