import { t as cn } from "./utils-Bn6jYw4Z.js";
import "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { ChevronDownIcon } from "lucide-react";
import { Accordion } from "radix-ui";
//#region src/components/ui/accordion.tsx
var Accordion$1 = Accordion.Root;
var AccordionItem = Accordion.Item;
function AccordionTrigger({ className, children, ...props }) {
	return /* @__PURE__ */ jsx(Accordion.Header, {
		className: "flex",
		children: /* @__PURE__ */ jsxs(Accordion.Trigger, {
			className: cn("flex flex-1 items-center justify-between py-3 px-4 text-sm font-semibold text-left transition-all bg-gray-100 border border-gray-300 hover:bg-gray-200 [&[data-state=open]>svg]:rotate-180", className),
			...props,
			children: [children, /* @__PURE__ */ jsx(ChevronDownIcon, { className: "h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200" })]
		})
	});
}
function AccordionContent({ className, children, ...props }) {
	return /* @__PURE__ */ jsx(Accordion.Content, {
		className: cn("overflow-hidden text-sm data-[state=closed]:animate-none data-[state=open]:animate-none", className),
		...props,
		children: /* @__PURE__ */ jsx("div", {
			className: "border border-t-0 border-gray-300 p-4",
			children
		})
	});
}
//#endregion
export { AccordionTrigger as i, AccordionContent as n, AccordionItem as r, Accordion$1 as t };
