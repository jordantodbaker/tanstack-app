import { i as createServerFn } from "../server.js";
import { t as createSsrRpc } from "./createSsrRpc-BHnkakhN.js";
import { t as cn } from "./utils-Bn6jYw4Z.js";
/* empty css             */
import { t as Route } from "./routes-BckDoskN.js";
import { t as Input } from "./input-DzVBLfOo.js";
import { t as Label$1 } from "./label-DE_X9-71.js";
import { t as Button } from "./button-Bae12qhq.js";
import * as React$1 from "react";
import React, { useEffect, useState } from "react";
import { isRedirect, useRouter } from "@tanstack/react-router";
import { jsx, jsxs } from "react/jsx-runtime";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react";
import { createColumnHelper, flexRender, getCoreRowModel, getFilteredRowModel, useReactTable } from "@tanstack/react-table";
import { cva } from "class-variance-authority";
import { Dialog, Select } from "radix-ui";
//#region node_modules/@tanstack/react-start/dist/esm/useServerFn.js
function useServerFn(serverFn) {
	const router = useRouter();
	return React$1.useCallback(async (...args) => {
		try {
			const res = await serverFn(...args);
			if (isRedirect(res)) throw res;
			return res;
		} catch (err) {
			if (isRedirect(err)) {
				err.options._fromLocation = router.stores.location.state;
				return router.navigate(router.resolveRedirect(err).options);
			}
			throw err;
		}
	}, [router, serverFn]);
}
//#endregion
//#region src/components/ui/dialog.tsx
function Dialog$1({ ...props }) {
	return /* @__PURE__ */ jsx(Dialog.Root, {
		"data-slot": "dialog",
		...props
	});
}
function DialogTrigger({ ...props }) {
	return /* @__PURE__ */ jsx(Dialog.Trigger, {
		"data-slot": "dialog-trigger",
		...props
	});
}
function DialogPortal({ ...props }) {
	return /* @__PURE__ */ jsx(Dialog.Portal, {
		"data-slot": "dialog-portal",
		...props
	});
}
function DialogClose({ ...props }) {
	return /* @__PURE__ */ jsx(Dialog.Close, {
		"data-slot": "dialog-close",
		...props
	});
}
function DialogOverlay({ className, ...props }) {
	return /* @__PURE__ */ jsx(Dialog.Overlay, {
		"data-slot": "dialog-overlay",
		className: cn("fixed inset-0 isolate z-50 bg-black/80 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0", className),
		...props
	});
}
function DialogContent({ className, children, showCloseButton = true, ...props }) {
	return /* @__PURE__ */ jsxs(DialogPortal, { children: [/* @__PURE__ */ jsx(DialogOverlay, {}), /* @__PURE__ */ jsxs(Dialog.Content, {
		"data-slot": "dialog-content",
		className: cn("fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-xs/relaxed text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className),
		...props,
		children: [children, showCloseButton && /* @__PURE__ */ jsx(Dialog.Close, {
			"data-slot": "dialog-close",
			asChild: true,
			children: /* @__PURE__ */ jsxs(Button, {
				variant: "ghost",
				className: "absolute top-2 right-2",
				size: "icon-sm",
				children: [/* @__PURE__ */ jsx(XIcon, {}), /* @__PURE__ */ jsx("span", {
					className: "sr-only",
					children: "Close"
				})]
			})
		})]
	})] });
}
function DialogHeader({ className, ...props }) {
	return /* @__PURE__ */ jsx("div", {
		"data-slot": "dialog-header",
		className: cn("flex flex-col gap-1", className),
		...props
	});
}
function DialogFooter({ className, showCloseButton = false, children, ...props }) {
	return /* @__PURE__ */ jsxs("div", {
		"data-slot": "dialog-footer",
		className: cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className),
		...props,
		children: [children, showCloseButton && /* @__PURE__ */ jsx(Dialog.Close, {
			asChild: true,
			children: /* @__PURE__ */ jsx(Button, {
				variant: "outline",
				children: "Close"
			})
		})]
	});
}
function DialogTitle({ className, ...props }) {
	return /* @__PURE__ */ jsx(Dialog.Title, {
		"data-slot": "dialog-title",
		className: cn("font-heading text-sm font-medium", className),
		...props
	});
}
function DialogDescription({ className, ...props }) {
	return /* @__PURE__ */ jsx(Dialog.Description, {
		"data-slot": "dialog-description",
		className: cn("text-xs/relaxed text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground", className),
		...props
	});
}
//#endregion
//#region src/components/ui/field.tsx
function FieldSet({ className, ...props }) {
	return /* @__PURE__ */ jsx("fieldset", {
		"data-slot": "field-set",
		className: cn("flex flex-col gap-4 has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3", className),
		...props
	});
}
function FieldLegend({ className, variant = "legend", ...props }) {
	return /* @__PURE__ */ jsx("legend", {
		"data-slot": "field-legend",
		"data-variant": variant,
		className: cn("mb-2 font-medium data-[variant=label]:text-xs/relaxed data-[variant=legend]:text-sm", className),
		...props
	});
}
var fieldVariants = cva("group/field flex w-full gap-2 data-[invalid=true]:text-destructive", {
	variants: { orientation: {
		vertical: "flex-col *:w-full [&>.sr-only]:w-auto",
		horizontal: "flex-row items-center has-[>[data-slot=field-content]]:items-start *:data-[slot=field-label]:flex-auto has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
		responsive: "flex-col *:w-full @md/field-group:flex-row @md/field-group:items-center @md/field-group:*:w-auto @md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:*:data-[slot=field-label]:flex-auto [&>.sr-only]:w-auto @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px"
	} },
	defaultVariants: { orientation: "vertical" }
});
function Field({ className, orientation = "vertical", ...props }) {
	return /* @__PURE__ */ jsx("div", {
		role: "group",
		"data-slot": "field",
		"data-orientation": orientation,
		className: cn(fieldVariants({ orientation }), className),
		...props
	});
}
function FieldLabel({ className, ...props }) {
	return /* @__PURE__ */ jsx(Label$1, {
		"data-slot": "field-label",
		className: cn("group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50 has-data-checked:bg-primary/5 has-[>[data-slot=field]]:rounded-md has-[>[data-slot=field]]:border *:data-[slot=field]:p-2 dark:has-data-checked:bg-primary/10", "has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col", className),
		...props
	});
}
function FieldDescription({ className, ...props }) {
	return /* @__PURE__ */ jsx("p", {
		"data-slot": "field-description",
		className: cn("text-left text-xs/relaxed leading-normal font-normal text-muted-foreground group-has-data-horizontal/field:text-balance [[data-variant=legend]+&]:-mt-1.5", "last:mt-0 nth-last-2:-mt-1", "[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary", className),
		...props
	});
}
//#endregion
//#region src/components/ui/select.tsx
function Select$1({ ...props }) {
	return /* @__PURE__ */ jsx(Select.Root, {
		"data-slot": "select",
		...props
	});
}
function SelectGroup({ className, ...props }) {
	return /* @__PURE__ */ jsx(Select.Group, {
		"data-slot": "select-group",
		className: cn("scroll-my-1 p-1", className),
		...props
	});
}
function SelectValue({ ...props }) {
	return /* @__PURE__ */ jsx(Select.Value, {
		"data-slot": "select-value",
		...props
	});
}
function SelectTrigger({ className, size = "default", children, ...props }) {
	return /* @__PURE__ */ jsxs(Select.Trigger, {
		"data-slot": "select-trigger",
		"data-size": size,
		className: cn("flex w-fit items-center justify-between gap-1.5 rounded-md border border-input bg-input/20 px-2 py-1.5 text-xs/relaxed whitespace-nowrap transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-7 data-[size=sm]:h-6 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5", className),
		...props,
		children: [children, /* @__PURE__ */ jsx(Select.Icon, {
			asChild: true,
			children: /* @__PURE__ */ jsx(ChevronDownIcon, { className: "pointer-events-none size-3.5 text-muted-foreground" })
		})]
	});
}
function SelectContent({ className, children, position = "item-aligned", align = "center", ...props }) {
	return /* @__PURE__ */ jsx(Select.Portal, { children: /* @__PURE__ */ jsxs(Select.Content, {
		"data-slot": "select-content",
		"data-align-trigger": position === "item-aligned",
		className: cn("relative z-50 max-h-(--radix-select-content-available-height) min-w-32 origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1", className),
		position,
		align,
		...props,
		children: [
			/* @__PURE__ */ jsx(SelectScrollUpButton, {}),
			/* @__PURE__ */ jsx(Select.Viewport, {
				"data-position": position,
				className: cn("data-[position=popper]:h-(--radix-select-trigger-height) data-[position=popper]:w-full data-[position=popper]:min-w-(--radix-select-trigger-width)", position === "popper" && ""),
				children
			}),
			/* @__PURE__ */ jsx(SelectScrollDownButton, {})
		]
	}) });
}
function SelectItem({ className, children, ...props }) {
	return /* @__PURE__ */ jsxs(Select.Item, {
		"data-slot": "select-item",
		className: cn("relative flex min-h-7 w-full cursor-default items-center gap-2 rounded-md px-2 py-1 text-xs/relaxed outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2", className),
		...props,
		children: [/* @__PURE__ */ jsx("span", {
			className: "pointer-events-none absolute right-2 flex items-center justify-center",
			children: /* @__PURE__ */ jsx(Select.ItemIndicator, { children: /* @__PURE__ */ jsx(CheckIcon, { className: "pointer-events-none" }) })
		}), /* @__PURE__ */ jsx(Select.ItemText, { children })]
	});
}
function SelectScrollUpButton({ className, ...props }) {
	return /* @__PURE__ */ jsx(Select.ScrollUpButton, {
		"data-slot": "select-scroll-up-button",
		className: cn("z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-3.5", className),
		...props,
		children: /* @__PURE__ */ jsx(ChevronUpIcon, {})
	});
}
function SelectScrollDownButton({ className, ...props }) {
	return /* @__PURE__ */ jsx(Select.ScrollDownButton, {
		"data-slot": "select-scroll-down-button",
		className: cn("z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-3.5", className),
		...props,
		children: /* @__PURE__ */ jsx(ChevronDownIcon, {})
	});
}
//#endregion
//#region src/components/ui/textarea.tsx
function Textarea({ className, ...props }) {
	return /* @__PURE__ */ jsx("textarea", {
		"data-slot": "textarea",
		className: cn("flex field-sizing-content min-h-16 w-full resize-none rounded-md border border-input bg-input/20 px-2 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:text-xs/relaxed dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40", className),
		...props
	});
}
//#endregion
//#region src/components/Changelog/AddChangeItemDialog.tsx
function AddChangeItemDialog({ statusLookup, onAddLog }) {
	const [projectId, setProjectId] = useState("");
	const [cvrId, setCvrId] = useState("");
	const [status, setStatus] = useState("");
	const [description, setDescription] = useState("");
	return /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsxs(Dialog$1, { children: [/* @__PURE__ */ jsx(DialogTrigger, { children: /* @__PURE__ */ jsx(Button, { children: "Add Change Item" }) }), /* @__PURE__ */ jsxs(DialogContent, { children: [/* @__PURE__ */ jsxs(FieldSet, { children: [
		/* @__PURE__ */ jsx(FieldLegend, { children: "Add" }),
		/* @__PURE__ */ jsx(FieldDescription, { children: "Add an item to the changelog" }),
		/* @__PURE__ */ jsxs(Field, { children: [/* @__PURE__ */ jsx(FieldLabel, { children: "Project ID" }), /* @__PURE__ */ jsx(Input, {
			id: "projectId",
			onChange: (e) => setProjectId(e.target.value),
			value: projectId
		})] }),
		/* @__PURE__ */ jsxs(Field, { children: [/* @__PURE__ */ jsx(FieldLabel, { children: "CVR ID" }), /* @__PURE__ */ jsx(Input, {
			id: "cvrId",
			onChange: (e) => setCvrId(e.target.value),
			value: cvrId
		})] }),
		/* @__PURE__ */ jsxs(Field, { children: [/* @__PURE__ */ jsx(FieldLabel, { children: "Status" }), /* @__PURE__ */ jsxs(Select$1, {
			defaultValue: "",
			onValueChange: setStatus,
			children: [/* @__PURE__ */ jsx(SelectTrigger, {
				id: "status",
				children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Status" })
			}), /* @__PURE__ */ jsx(SelectContent, { children: /* @__PURE__ */ jsx(SelectGroup, { children: statusLookup.map((item) => /* @__PURE__ */ jsx(SelectItem, {
				value: `${item.id}`,
				children: item.status
			}, item.id)) }) })]
		})] }),
		/* @__PURE__ */ jsxs(Field, { children: [/* @__PURE__ */ jsx(FieldLabel, { children: "Description" }), /* @__PURE__ */ jsx(Textarea, {
			id: "description",
			onChange: (e) => setDescription(e.target.value),
			value: description
		})] })
	] }), /* @__PURE__ */ jsxs(Field, {
		orientation: "horizontal",
		children: [/* @__PURE__ */ jsx(DialogClose, { children: /* @__PURE__ */ jsx(Button, {
			type: "submit",
			onClick: async () => await onAddLog({ data: {
				projectId: +projectId,
				cvrId: +cvrId,
				statusId: +status,
				description,
				createdAt: /* @__PURE__ */ new Date(),
				updatedAt: /* @__PURE__ */ new Date()
			} }),
			children: "Submit"
		}) }), /* @__PURE__ */ jsx(DialogClose, { children: /* @__PURE__ */ jsx(Button, {
			variant: "outline",
			type: "button",
			children: "Cancel"
		}) })]
	})] })] }) });
}
//#endregion
//#region src/components/Changelog/ChangelogTable.tsx
var TableCell = ({ getValue, row, column, table }) => {
	const initialValue = getValue();
	const [value, setValue] = useState(initialValue);
	useEffect(() => {
		setValue(initialValue);
	}, [initialValue]);
	const onBlur = () => {
		table.options.meta?.updateData(row.index, column.id, value);
	};
	return /* @__PURE__ */ jsx("input", {
		value,
		onChange: (e) => setValue(e.target.value),
		onBlur,
		className: "w-full"
	});
};
var TableDropdown = ({ getValue, row, column, table }) => {
	const initialValue = getValue();
	const [value, setValue] = useState(initialValue);
	useEffect(() => {
		setValue(initialValue);
	}, [initialValue]);
	const onBlur = () => {
		table.options.meta?.updateData(row.index, column.id, value);
	};
	return /* @__PURE__ */ jsx("select", {
		onChange: (e) => setValue(e.target.value),
		onBlur,
		className: "w-full",
		children: table.options.meta.statusLookup.map((item) => /* @__PURE__ */ jsx("option", {
			value: item.id,
			selected: initialValue === item.id,
			children: item.status
		}, item.id))
	});
};
var columnHelper = createColumnHelper();
var getColumns = (statusLookup, deleteLog) => [
	columnHelper.accessor("id", {
		cell: (info) => info.getValue(),
		footer: (info) => info.column.id
	}),
	columnHelper.accessor((row) => row.projectId, {
		id: "projectId",
		cell: (info) => /* @__PURE__ */ jsx("i", { children: info.getValue() }),
		header: () => /* @__PURE__ */ jsx("span", { children: "Project Id" }),
		footer: (info) => info.column.id
	}),
	columnHelper.accessor("cvrId", {
		header: () => "CVR ID",
		cell: (info) => info.renderValue(),
		footer: (info) => info.column.id
	}),
	columnHelper.accessor("description", {
		header: () => /* @__PURE__ */ jsx("span", { children: "Description" }),
		footer: (info) => info.column.id,
		cell: TableCell
	}),
	columnHelper.accessor("statusId", {
		header: "Status",
		footer: (info) => info.column.id,
		cell: TableDropdown,
		meta: { statusLookup },
		filterFn: (row, columnId, filterValue) => row.getValue(columnId) === filterValue
	}),
	{
		id: "delete",
		header: "Delete",
		cell: (info) => /* @__PURE__ */ jsx("div", {
			className: "flex justify-center",
			children: /* @__PURE__ */ jsxs(Dialog$1, { children: [/* @__PURE__ */ jsx(DialogTrigger, { children: /* @__PURE__ */ jsx(Button, { children: "Delete" }) }), /* @__PURE__ */ jsxs(DialogContent, { children: [/* @__PURE__ */ jsxs(DialogHeader, { children: [/* @__PURE__ */ jsx(DialogTitle, { children: "Are you absolutely sure you want to delete this?" }), /* @__PURE__ */ jsx(DialogDescription, { children: "This action cannot be undone. This will permanently delete this log record." })] }), /* @__PURE__ */ jsxs(DialogFooter, { children: [/* @__PURE__ */ jsx(DialogClose, {
				asChild: true,
				children: /* @__PURE__ */ jsx(Button, {
					variant: "outline",
					children: "Cancel"
				})
			}), /* @__PURE__ */ jsx(DialogClose, { children: /* @__PURE__ */ jsx(Button, {
				onClick: async () => {
					info.table.options.meta?.deleteLog?.(info.row.index);
					await deleteLog(info.row.original.id);
				},
				children: "Delete"
			}) })] })] })] })
		})
	}
];
//#endregion
//#region src/routes/index.tsx?tsr-split=component
var updateChangelogs = createServerFn({ method: "POST" }).inputValidator((data) => data).handler(createSsrRpc("a848c26e53e67cea4bb685d2edcfd894fa51aea235caef9d348961ba2107e444"));
var addChangelog = createServerFn({ method: "POST" }).inputValidator((data) => data).handler(createSsrRpc("6ded4409a5b599a60a06f320bea1418fe83b4153dbc8ce87daf919f040a51c06"));
var deleteChangelog = createServerFn({ method: "POST" }).inputValidator((data) => data).handler(createSsrRpc("aacd2986ec9cbe2f474481bca018f9786020d2fcffb65c0660b6e44d1abc0bef"));
function isNotUndefined(value) {
	return value !== void 0;
}
function Home() {
	const pageData = Route.useLoaderData();
	const logForms = pageData.changeLogs.map((log) => ({
		...log,
		isDirty: false
	}));
	const [data, _setData] = React.useState(() => [...logForms]);
	const [columnFilters, setColumnFilters] = React.useState([]);
	const updateData = useServerFn(updateChangelogs);
	const addLog = useServerFn(addChangelog);
	const deleteLog = useServerFn(deleteChangelog);
	const table = useReactTable({
		data,
		columns: getColumns(pageData.statusLookup, (id) => deleteLog({ data: { id } })),
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onColumnFiltersChange: setColumnFilters,
		state: { columnFilters },
		filterFns: { fuzzy: () => true },
		meta: {
			updateData: (rowIndex, columnId, value) => {
				_setData((old) => old.map((row, index) => {
					if (index === rowIndex) return {
						...old[rowIndex],
						[columnId]: value,
						isDirty: true
					};
					return row;
				}));
			},
			deleteLog: (rowIndex) => {
				_setData(data.map((log) => data[rowIndex].id !== log.id ? log : void 0).filter(isNotUndefined));
			},
			addLog: (log) => {
				_setData((old) => [...old, {
					...log,
					isDirty: false
				}]);
			},
			statusLookup: pageData.statusLookup
		}
	});
	return /* @__PURE__ */ jsx("main", { children: /* @__PURE__ */ jsxs("div", {
		className: "flex justify-center flex-col p-4",
		children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("div", {
			className: "mb-4",
			children: /* @__PURE__ */ jsx(AddChangeItemDialog, {
				statusLookup: pageData.statusLookup,
				onAddLog: async (log) => {
					const newLog = await addLog(log);
					table.options.meta?.addLog?.(newLog);
				}
			})
		}), /* @__PURE__ */ jsxs("table", {
			className: "w-full",
			children: [/* @__PURE__ */ jsx("thead", { children: table.getHeaderGroups().map((headerGroup) => /* @__PURE__ */ jsx("tr", { children: headerGroup.headers.map((header) => /* @__PURE__ */ jsxs("th", { children: [header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext()), header.column.id === "statusId" && /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsxs("select", {
				className: "w-full",
				onChange: (e) => header.column.setFilterValue(e.target.value ? +e.target.value : void 0),
				children: [/* @__PURE__ */ jsx("option", {
					value: "",
					children: "All"
				}), pageData.statusLookup.map((s) => /* @__PURE__ */ jsx("option", {
					value: s.id,
					children: s.status
				}, s.id))]
			}) })] }, header.id)) }, headerGroup.id)) }), /* @__PURE__ */ jsx("tbody", { children: table.getRowModel().rows.map((row) => /* @__PURE__ */ jsx("tr", { children: row.getVisibleCells().map((cell) => /* @__PURE__ */ jsx("td", { children: flexRender(cell.column.columnDef.cell, cell.getContext()) }, cell.id)) }, row.id)) })]
		})] }), /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx(Button, {
			className: "mt-4",
			onClick: async () => await updateData({ data }),
			children: "Save Changes"
		}) })]
	}) });
}
//#endregion
export { Home as component };
