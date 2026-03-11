import { jsx as _jsx } from "react/jsx-runtime";
import { useRef, useEffect } from 'react';
export default function Button({ onClick, children, className, disabled, ...rest }) {
    const ref = useRef(null);
    const handlerRef = useRef(onClick);
    handlerRef.current = onClick;
    useEffect(() => {
        const el = ref.current;
        if (!el)
            return;
        const handler = (e) => {
            if (!el.disabled && handlerRef.current) {
                handlerRef.current(e);
            }
        };
        el.addEventListener('click', handler);
        return () => el.removeEventListener('click', handler);
    }, []);
    return (_jsx("button", { ref: ref, className: className, disabled: disabled, ...rest, children: children }));
}
