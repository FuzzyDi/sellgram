import { jsx as _jsx } from "react/jsx-runtime";
import { useRef, useEffect } from 'react';
export default function NativeButton({ onClick, children, className = '', disabled = false, type = 'button' }) {
    const ref = useRef(null);
    useEffect(() => {
        const el = ref.current;
        if (!el)
            return;
        const handler = (e) => {
            e.preventDefault();
            if (!disabled)
                onClick();
        };
        el.addEventListener('click', handler);
        return () => el.removeEventListener('click', handler);
    }, [onClick, disabled]);
    return (_jsx("button", { ref: ref, type: type, disabled: disabled, className: className, children: children }));
}
