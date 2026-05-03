import { QRCodeCanvas } from "qrcode.react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface EventQRProps {
  roomCode: string;
  size?: number;
  showActions?: boolean;
}

export function EventQR({ roomCode, size = 240, showActions = true }: EventQRProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const joinUrl = `${window.location.origin}/join?code=${roomCode}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      toast({ title: "Link copied", description: joinUrl });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const download = () => {
    const canvas = wrapRef.current?.querySelector("canvas");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-${roomCode}.png`;
    a.click();
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div ref={wrapRef} className="rounded-lg border bg-white p-3">
        <QRCodeCanvas
          value={joinUrl}
          size={size}
          bgColor="#ffffff"
          fgColor="#0a0a0c"
          level="M"
          includeMargin={false}
        />
      </div>
      <div className="font-mono font-bold tracking-widest text-xl">{roomCode}</div>
      {showActions && (
        <div className="flex flex-wrap gap-2 justify-center">
          <Button variant="outline" size="sm" onClick={copyLink}>
            <Copy className="mr-2 h-4 w-4" /> Copy join link
          </Button>
          <Button variant="outline" size="sm" onClick={download}>
            <Download className="mr-2 h-4 w-4" /> Download QR
          </Button>
        </div>
      )}
    </div>
  );
}
