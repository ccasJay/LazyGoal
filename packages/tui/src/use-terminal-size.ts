import { useEffect, useState } from "react";
import { useStdout } from "ink";

/**
 * 订阅当前 Ink 输出流尺寸；无终端尺寸的输出使用 80×24。
 *
 * @returns 当前可用列数与行数；组件卸载时移除 resize 订阅。
 */
export function useTerminalSize(): { readonly columns: number; readonly rows: number } {
    const { stdout } = useStdout();
    const readSize = () => ({ columns: stdout.columns || 80, rows: stdout.rows || 24 });
    const [size, setSize] = useState(readSize);

    useEffect(() => {
        const resize = () => setSize(readSize());
        resize();
        stdout.on("resize", resize);
        return () => { stdout.off("resize", resize); };
    }, [stdout]);

    return size;
}
