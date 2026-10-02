import type { Action } from 'svelte/action';

/** Fades and lifts an element in the first time it scrolls into view. */
export const reveal: Action<HTMLElement, number | undefined> = (node, delay = 0) => {
	if (typeof IntersectionObserver === 'undefined') return;
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
	node.style.opacity = '0';
	const observer = new IntersectionObserver(
		([entry]) => {
			if (!entry.isIntersecting) return;
			node.style.opacity = '';
			node.style.animationDelay = `${delay}ms`;
			node.classList.add('animate-rise');
			observer.disconnect();
		},
		{ rootMargin: '0px 0px -40px 0px' }
	);
	observer.observe(node);
	return { destroy: () => observer.disconnect() };
};
