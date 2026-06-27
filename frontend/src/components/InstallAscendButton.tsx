"use client";

import { Download, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { INSTALL_STATE_EVENT, isAscendInstalled, requestInstallAscend } from "@/lib/installAscend";

export function InstallAscendButton() {
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const refresh = () => setInstalled(isAscendInstalled());
    refresh();
    window.addEventListener(INSTALL_STATE_EVENT, refresh);
    window.addEventListener("appinstalled", refresh);
    return () => {
      window.removeEventListener(INSTALL_STATE_EVENT, refresh);
      window.removeEventListener("appinstalled", refresh);
    };
  }, []);

  return (
    <button
      type="button"
      disabled={installed}
      onClick={requestInstallAscend}
      className="ascend-pressable flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-calm/50 bg-calm/10 font-semibold text-calm hover:bg-calm/15 disabled:border-line disabled:bg-ink disabled:text-zinc-400"
    >
      {installed ? <Smartphone size={19} /> : <Download size={19} />}
      {installed ? "Ascend is installed" : "Install Ascend"}
    </button>
  );
}
