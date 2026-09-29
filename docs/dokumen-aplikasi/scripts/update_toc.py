#!/usr/bin/env python3
"""Perbarui daftar isi (dan semua indeks/bidang) sebuah .docx lewat LibreOffice.

Direkonstruksi sesuai antarmuka yang didokumentasikan SKILL.md (berkas asli
hilang saat sesi). Membuka berkas tanpa layar, memperbarui indeks, menyimpan
ulang sebagai .docx. Kode keluar 3 bila LibreOffice/uno tak bisa dipakai.

Pemakaian: python update_toc.py dokumen.docx
Jalankan dengan /usr/bin/python3 (uno sistem), bukan python venv.
"""
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

PORT = 2002


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__); return 2
    src = Path(sys.argv[1]).resolve()
    try:
        import uno  # type: ignore
        from com.sun.star.beans import PropertyValue  # type: ignore
    except Exception as e:  # noqa: BLE001
        print(f"uno tidak tersedia: {e}", file=sys.stderr); return 3

    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        print("soffice tidak ditemukan", file=sys.stderr); return 3

    env = os.environ.copy()
    env["SAL_USE_VCLPLUGIN"] = "svp"
    env["LD_LIBRARY_PATH"] = "/usr/lib/libreoffice/program:" + env.get("LD_LIBRARY_PATH", "")
    profile = tempfile.mkdtemp(prefix="lo-profile-")
    saved = False
    proc = subprocess.Popen(
        [soffice, "--headless", "--invisible", "--norestore", "--nologo",
         f"-env:UserInstallation=file://{profile}",
         f"--accept=socket,host=127.0.0.1,port={PORT};urp;"],
        env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
        ctx = None
        for _ in range(60):
            try:
                ctx = resolver.resolve(f"uno:socket,host=127.0.0.1,port={PORT};urp;StarOffice.ComponentContext")
                break
            except Exception:  # noqa: BLE001
                time.sleep(0.5)
        if ctx is None:
            print("tidak bisa tersambung ke LibreOffice", file=sys.stderr); return 3
        desktop = ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)

        def pv(n, v):
            p = PropertyValue(); p.Name, p.Value = n, v; return p

        doc = desktop.loadComponentFromURL(src.as_uri(), "_blank", 0, (pv("Hidden", True),))
        try:
            pstyles = doc.getStyleFamilies().getByName("ParagraphStyles")
            for nm in ("Contents 1", "Contents 2", "Contents 3", "TOC 1", "TOC 2", "TOC 3"):
                if pstyles.hasByName(nm):
                    st = pstyles.getByName(nm)
                    st.ParaTopMargin = 0
                    st.ParaBottomMargin = 70
        except Exception:  # noqa: BLE001
            pass
        idx = doc.getDocumentIndexes()
        for _pass in range(2):
            for i in range(idx.getCount()):
                idx.getByIndex(i).update()
        try:
            doc.refresh()
        except Exception:  # noqa: BLE001
            pass
        doc.storeToURL(src.as_uri(), (pv("FilterName", "MS Word 2007 XML"),))
        saved = True
        n = idx.getCount()
        for closer in (lambda: doc.close(True), lambda: desktop.terminate()):
            try:
                closer()
            except Exception:  # noqa: BLE001
                pass
        print(f"daftar isi diperbarui: {src.name} ({n} indeks)")
        return 0
    except Exception as e:  # noqa: BLE001
        if saved:
            print(f"daftar isi diperbarui: {src.name} (peringatan saat menutup: {e})")
            return 0
        print(f"gagal memperbarui: {e}", file=sys.stderr); return 3
    finally:
        try:
            proc.terminate(); proc.wait(timeout=10)
        except Exception:  # noqa: BLE001
            proc.kill()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
