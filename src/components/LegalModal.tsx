import React, { useEffect, useState } from 'react';
import { X, ShieldCheck, Scale, FileWarning, Flame, Lock } from 'lucide-react';

export type LegalTab = 'privacy' | 'terms' | 'dmca' | 'adult';

interface LegalModalProps {
  open: boolean;
  initialTab?: LegalTab;
  onClose: () => void;
}

const TABS: Array<{ id: LegalTab; label: string; icon: React.ElementType }> = [
  { id: 'privacy', label: 'Privacy', icon: Lock },
  { id: 'terms', label: 'Terms', icon: Scale },
  { id: 'dmca', label: 'Copyright', icon: FileWarning },
  { id: 'adult', label: '18+ Notice', icon: Flame },
];

const CONTENT: Record<LegalTab, { title: string; body: React.ReactNode }> = {
  privacy: {
    title: 'Privacy summary',
    body: (
      <div className="space-y-3">
        <p>
          StreamPulse does not require an account for public features. We do not host or permanently store the
          media you resolve — streams and downloads are relayed from the upstream source.
        </p>
        <p>
          The server records limited operational data: request time, requested URL, platform, response status,
          latency, IP address and browser user-agent. This is used for abuse prevention, debugging and aggregate
          analytics. Admin accounts can review and clear these logs.
        </p>
        <p>
          Your recent extractions may be saved in your browser&apos;s local storage to make the app faster. You can
          clear this at any time via your browser settings. The public &ldquo;recently resolved&rdquo; strip only shows
          a title, platform and thumbnail — never your IP or source link.
        </p>
        <p>
          Cookies are not used for tracking or advertising. If you deploy StreamPulse yourself, you are responsible
          for updating this notice and complying with the privacy laws that apply to your visitors.
        </p>
      </div>
    ),
  },
  terms: {
    title: 'Terms of use',
    body: (
      <div className="space-y-3">
        <p>
          StreamPulse is a convenience layer over third-party media gateways. It is provided &ldquo;as is&rdquo;
          without warranties of availability, accuracy or fitness for a particular purpose.
        </p>
        <p>
          Only download or stream content that you own, that is licensed to you, or that the rights holder has made
          available for download. You are solely responsible for how you use the links produced by this service.
        </p>
        <p>
          Automated scraping, credential sharing, attempts to bypass rate limits, or use of the service to attack
          third parties is prohibited. Access may be limited or blocked to protect the service and its users.
        </p>
        <p>
          The operator may suspend or modify public features at any time. Admin settings can disable search,
          downloads, adult content or the entire public gateway.
        </p>
      </div>
    ),
  },
  dmca: {
    title: 'Copyright & takedown',
    body: (
      <div className="space-y-3">
        <p>
          StreamPulse does not store or index media files. It forwards a URL to an upstream extraction gateway and
          returns the resulting links. If you believe content is being made accessible in violation of your rights,
          contact the operator of this deployment with the details below.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Identification of the copyrighted work you believe is infringed.</li>
          <li>The exact StreamPulse and upstream URLs involved.</li>
          <li>Your name, organization and contact details.</li>
          <li>A statement that you have a good-faith belief the use is unauthorized.</li>
          <li>A statement, under penalty of perjury, that the information is accurate and you are authorized to act.</li>
        </ul>
        <p>
          Deployment operators should publish a real takedown contact address and respond promptly. Public
          configuration and the admin console make it easy to disable specific features while a report is reviewed.
        </p>
      </div>
    ),
  },
  adult: {
    title: '18+ content notice',
    body: (
      <div className="space-y-3">
        <p>
          Certain search engines and extraction providers expose adult content. Those tabs are marked 18+ and
          require an explicit confirmation. You must be of legal age in your jurisdiction to access them.
        </p>
        <p>
          Adult content can be disabled completely from the admin console. When disabled, the server rejects adult
          extraction and search requests, hides adult results, and excludes them from public history.
        </p>
        <p>
          Never use this service to access non-consensual, abusive or illegal material. Report such content to the
          platform hosting it and to the operator of this deployment immediately.
        </p>
      </div>
    ),
  },
};

export const LegalModal: React.FC<LegalModalProps> = ({ open, initialTab = 'privacy', onClose }) => {
  const [tab, setTab] = useState<LegalTab>(initialTab);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <button className="absolute inset-0 h-full w-full cursor-default" onClick={onClose} aria-label="Close dialog" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-title"
        className="relative max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-t-2xl border border-neutral-800 bg-neutral-950 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <h2 id="legal-title" className="text-sm font-bold text-white">Legal & safety</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-800 hover:text-white" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-neutral-800 px-4 py-2">
          {TABS.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  tab === item.id ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {item.label}
              </button>
            );
          })}
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-5 sm:px-6">
          <h3 className="mb-3 text-lg font-bold text-white">{CONTENT[tab].title}</h3>
          <div className="text-sm leading-relaxed text-neutral-400">{CONTENT[tab].body}</div>
          <p className="mt-5 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-[11px] text-neutral-500">
            This template is not legal advice. Deployment operators must review it against their local laws and
            publish accurate contact details.
          </p>
        </div>
      </div>
    </div>
  );
};
