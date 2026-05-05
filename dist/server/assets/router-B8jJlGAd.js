import { t as getGlobalStartContext } from "../server.js";
import { r as isClient, t as getPublicEnvVariables } from "./env-Co0kkVvb.js";
import { r as disciplines } from "./disciplines-D-_GrFF6.js";
import { a as SelectedProjectProvider, o as useSelectedProject, t as allowedCbsL1CodesQueryOptions } from "./setup-DOEkvnEs.js";
import { n as ProjectSelect, t as Route$7 } from "./setup-efOiTaPJ.js";
import { t as Route$8 } from "./piping-Cf2ubtPn.js";
import { t as Route$9 } from "./materials-PTpqgOfC.js";
import { t as Route$10 } from "./_discipline-DD_LBdvt.js";
import { t as Route$11 } from "./routes-BckDoskN.js";
import * as React$1 from "react";
import React, { useEffect, useRef, useTransition } from "react";
import { ErrorComponent, HeadContent, Link, Outlet, ScriptOnce, Scripts, createFileRoute, createRootRouteWithContext, createRouter, lazyRouteComponent, rootRouteId, useLocation, useMatch, useNavigate, useParams, useRouter, useRouterState } from "@tanstack/react-router";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { QueryClient, useQuery } from "@tanstack/react-query";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { ChevronDown, ChevronRight, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { InternalClerkProvider, setErrorThrowerOptions, useRoutingProps } from "@clerk/react/internal";
import { OrganizationList, OrganizationProfile, SignIn, SignUp, UNSAFE_PortalProvider, UserProfile } from "@clerk/react";
import { getToken } from "@clerk/shared/getToken";
import axios from "redaxios";
//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
//#endregion
//#region src/components/DefaultCatchBoundary.tsx
function DefaultCatchBoundary({ error }) {
	const router = useRouter();
	const isRoot = useMatch({
		strict: false,
		select: (state) => state.id === rootRouteId
	});
	console.error(error);
	return /* @__PURE__ */ jsxs("div", {
		className: "min-w-0 flex-1 p-4 flex flex-col items-center justify-center gap-6",
		children: [/* @__PURE__ */ jsx(ErrorComponent, { error }), /* @__PURE__ */ jsxs("div", {
			className: "flex gap-2 items-center flex-wrap",
			children: [/* @__PURE__ */ jsx("button", {
				onClick: () => {
					router.invalidate();
				},
				className: `px-2 py-1 bg-gray-600 dark:bg-gray-700 rounded-sm text-white uppercase font-extrabold`,
				children: "Try Again"
			}), isRoot ? /* @__PURE__ */ jsx(Link, {
				to: "/",
				className: `px-2 py-1 bg-gray-600 dark:bg-gray-700 rounded-sm text-white uppercase font-extrabold`,
				children: "Home"
			}) : /* @__PURE__ */ jsx(Link, {
				to: "/",
				className: `px-2 py-1 bg-gray-600 dark:bg-gray-700 rounded-sm text-white uppercase font-extrabold`,
				onClick: (e) => {
					e.preventDefault();
					window.history.back();
				},
				children: "Go Back"
			})]
		})]
	});
}
//#endregion
//#region src/components/NotFound.tsx
function NotFound({ children }) {
	return /* @__PURE__ */ jsxs("div", {
		className: "space-y-2 p-2",
		children: [/* @__PURE__ */ jsx("div", {
			className: "text-gray-600 dark:text-gray-400",
			children: children || /* @__PURE__ */ jsx("p", { children: "The page you are looking for does not exist." })
		}), /* @__PURE__ */ jsxs("p", {
			className: "flex items-center gap-2 flex-wrap",
			children: [/* @__PURE__ */ jsx("button", {
				onClick: () => window.history.back(),
				className: "bg-emerald-500 text-white px-2 py-1 rounded-sm uppercase font-black text-sm",
				children: "Go back"
			}), /* @__PURE__ */ jsx(Link, {
				to: "/",
				className: "bg-cyan-600 text-white px-2 py-1 rounded-sm uppercase font-black text-sm",
				children: "Start Over"
			})]
		})]
	});
}
//#endregion
//#region src/styles/app.css?url
var app_default = "/assets/app-C3YmR5CV.css";
//#endregion
//#region src/utils/seo.ts
var seo = ({ title, description, keywords, image }) => {
	return [
		{ title },
		{
			name: "description",
			content: description
		},
		{
			name: "keywords",
			content: keywords
		},
		{
			name: "twitter:title",
			content: title
		},
		{
			name: "twitter:description",
			content: description
		},
		{
			name: "twitter:creator",
			content: "@tannerlinsley"
		},
		{
			name: "twitter:site",
			content: "@tannerlinsley"
		},
		{
			name: "og:type",
			content: "website"
		},
		{
			name: "og:title",
			content: title
		},
		{
			name: "og:description",
			content: description
		},
		...image ? [
			{
				name: "twitter:image",
				content: image
			},
			{
				name: "twitter:card",
				content: "summary_large_image"
			},
			{
				name: "og:image",
				content: image
			}
		] : []
	];
};
//#endregion
//#region node_modules/@clerk/tanstack-react-start/dist/client/OptionsContext.js
var ClerkOptionsCtx = React.createContext(void 0);
ClerkOptionsCtx.displayName = "ClerkOptionsCtx";
var ClerkOptionsProvider = (props) => {
	const { children, options } = props;
	return /* @__PURE__ */ jsx(ClerkOptionsCtx.Provider, {
		value: { value: options },
		children
	});
};
//#endregion
//#region node_modules/@clerk/tanstack-react-start/dist/client/useAwaitableNavigate.js
var useAwaitableNavigate = () => {
	const navigate = useNavigate();
	const location = useLocation();
	const resolveFunctionsRef = React.useRef([]);
	const resolveAll = () => {
		resolveFunctionsRef.current.forEach((resolve) => resolve());
		resolveFunctionsRef.current.splice(0, resolveFunctionsRef.current.length);
	};
	const [_, startTransition] = useTransition();
	React.useEffect(() => {
		resolveAll();
	}, [location]);
	return (options) => {
		return new Promise((res) => {
			startTransition(() => {
				resolveFunctionsRef.current.push(res);
				res(navigate(options));
			});
		});
	};
};
//#endregion
//#region node_modules/@clerk/tanstack-react-start/dist/client/utils.js
var pickFromClerkInitState = (clerkInitState) => {
	const { __clerk_ssr_state, __publishableKey, __proxyUrl, __domain, __isSatellite, __signInUrl, __signUpUrl, __clerkJSUrl, __clerkJSVersion, __clerkUIUrl, __clerkUIVersion, __telemetryDisabled, __telemetryDebug, __signInForceRedirectUrl, __signUpForceRedirectUrl, __signInFallbackRedirectUrl, __signUpFallbackRedirectUrl, __keylessClaimUrl, __keylessApiKeysUrl, __prefetchUI } = clerkInitState || {};
	return {
		clerkSsrState: __clerk_ssr_state,
		publishableKey: __publishableKey,
		proxyUrl: __proxyUrl,
		domain: __domain,
		isSatellite: !!__isSatellite,
		signInUrl: __signInUrl,
		signUpUrl: __signUpUrl,
		__internal_clerkJSUrl: __clerkJSUrl,
		__internal_clerkJSVersion: __clerkJSVersion,
		__internal_clerkUIUrl: __clerkUIUrl,
		__internal_clerkUIVersion: __clerkUIVersion,
		prefetchUI: __prefetchUI,
		telemetry: {
			disabled: __telemetryDisabled,
			debug: __telemetryDebug
		},
		signInForceRedirectUrl: __signInForceRedirectUrl,
		signUpForceRedirectUrl: __signUpForceRedirectUrl,
		signInFallbackRedirectUrl: __signInFallbackRedirectUrl,
		signUpFallbackRedirectUrl: __signUpFallbackRedirectUrl,
		__keylessClaimUrl,
		__keylessApiKeysUrl
	};
};
var mergeWithPublicEnvs = (restInitState) => {
	const envVars = getPublicEnvVariables();
	return {
		...restInitState,
		publishableKey: restInitState.publishableKey || envVars.publishableKey,
		domain: restInitState.domain || envVars.domain,
		isSatellite: restInitState.isSatellite || envVars.isSatellite,
		signInUrl: restInitState.signInUrl || envVars.signInUrl,
		signUpUrl: restInitState.signUpUrl || envVars.signUpUrl,
		__internal_clerkJSUrl: restInitState.__internal_clerkJSUrl || envVars.clerkJsUrl,
		__internal_clerkJSVersion: restInitState.__internal_clerkJSVersion || envVars.clerkJsVersion,
		__internal_clerkUIUrl: restInitState.__internal_clerkUIUrl || envVars.clerkUIUrl,
		__internal_clerkUIVersion: restInitState.__internal_clerkUIVersion || envVars.clerkUIVersion,
		signInForceRedirectUrl: restInitState.signInForceRedirectUrl,
		prefetchUI: restInitState.prefetchUI ?? envVars.prefetchUI
	};
};
function parseUrlForNavigation(to, baseUrl) {
	const url = new URL(to, baseUrl);
	const searchParams = Object.fromEntries(url.searchParams);
	return {
		to: url.pathname,
		search: Object.keys(searchParams).length > 0 ? searchParams : void 0,
		hash: url.hash ? url.hash.slice(1) : void 0
	};
}
//#endregion
//#region node_modules/@clerk/tanstack-react-start/dist/client/ClerkProvider.js
var ClerkProvider_exports = /* @__PURE__ */ __exportAll({ ClerkProvider: () => ClerkProvider });
import * as import__clerk_react from "@clerk/react";
__reExport(ClerkProvider_exports, import__clerk_react);
var SDK_METADATA = {
	name: "@clerk/tanstack-react-start",
	version: "1.1.7"
};
var awaitableNavigateRef = { current: void 0 };
function ClerkProvider({ children, ...providerProps }) {
	const awaitableNavigate = useAwaitableNavigate();
	const clerkInitialState = getGlobalStartContext()?.clerkInitialState ?? {};
	useEffect(() => {
		awaitableNavigateRef.current = awaitableNavigate;
	}, [awaitableNavigate]);
	const { clerkSsrState, __keylessClaimUrl, __keylessApiKeysUrl, ...restInitState } = pickFromClerkInitState((isClient() ? window.__clerk_init_state : clerkInitialState)?.__internal_clerk_state);
	const mergedProps = {
		...mergeWithPublicEnvs(restInitState),
		...providerProps
	};
	const keylessProps = __keylessClaimUrl ? {
		__internal_keyless_claimKeylessApplicationUrl: __keylessClaimUrl,
		__internal_keyless_copyInstanceKeysUrl: __keylessApiKeysUrl
	} : {};
	return /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx(ScriptOnce, { children: `window.__clerk_init_state = ${JSON.stringify(clerkInitialState)};` }), /* @__PURE__ */ jsx(ClerkOptionsProvider, {
		options: mergedProps,
		children: /* @__PURE__ */ jsx(InternalClerkProvider, {
			initialState: clerkSsrState,
			sdkMetadata: SDK_METADATA,
			routerPush: (to) => {
				const { search, hash, ...rest } = parseUrlForNavigation(to, window.location.origin);
				return awaitableNavigateRef.current?.({
					...rest,
					search,
					hash,
					replace: false
				});
			},
			routerReplace: (to) => {
				const { search, hash, ...rest } = parseUrlForNavigation(to, window.location.origin);
				return awaitableNavigateRef.current?.({
					...rest,
					search,
					hash,
					replace: true
				});
			},
			...mergedProps,
			...keylessProps,
			children
		})
	})] });
}
ClerkProvider.displayName = "ClerkProvider";
//#endregion
//#region node_modules/@clerk/tanstack-react-start/dist/client/uiComponents.js
var usePathnameWithoutSplatRouteParams = () => {
	const { _splat } = useParams({ strict: false });
	const { pathname } = useLocation();
	const splatRouteParam = _splat || "";
	return useRef(`/${pathname.replace(splatRouteParam, "").replace(/\/$/, "").replace(/^\//, "").trim()}`).current;
};
var UserProfile$1 = Object.assign((props) => {
	return /* @__PURE__ */ jsx(UserProfile, { ...useRoutingProps("UserProfile", props, { path: usePathnameWithoutSplatRouteParams() }) });
}, { ...UserProfile });
var OrganizationProfile$1 = Object.assign((props) => {
	return /* @__PURE__ */ jsx(OrganizationProfile, { ...useRoutingProps("OrganizationProfile", props, { path: usePathnameWithoutSplatRouteParams() }) });
}, { ...OrganizationProfile });
var OrganizationList$1 = Object.assign((props) => {
	return /* @__PURE__ */ jsx(OrganizationList, { ...useRoutingProps("OrganizationList", props, { path: usePathnameWithoutSplatRouteParams() }) });
}, { ...OrganizationList });
var SignIn$1 = (props) => {
	return /* @__PURE__ */ jsx(SignIn, { ...useRoutingProps("SignIn", props, { path: usePathnameWithoutSplatRouteParams() }) });
};
var SignUp$1 = (props) => {
	return /* @__PURE__ */ jsx(SignUp, { ...useRoutingProps("SignUp", props, { path: usePathnameWithoutSplatRouteParams() }) });
};
//#endregion
//#region node_modules/@clerk/tanstack-react-start/dist/client/index.js
var client_exports = /* @__PURE__ */ __exportAll({
	ClerkProvider: () => ClerkProvider,
	OrganizationList: () => OrganizationList$1,
	OrganizationProfile: () => OrganizationProfile$1,
	SignIn: () => SignIn$1,
	SignUp: () => SignUp$1,
	UNSAFE_PortalProvider: () => UNSAFE_PortalProvider,
	UserProfile: () => UserProfile$1
});
__reExport(client_exports, ClerkProvider_exports);
//#endregion
//#region node_modules/@clerk/tanstack-react-start/dist/index.js
var dist_exports = /* @__PURE__ */ __exportAll({
	ClerkProvider: () => ClerkProvider,
	OrganizationList: () => OrganizationList$1,
	OrganizationProfile: () => OrganizationProfile$1,
	SignIn: () => SignIn$1,
	SignUp: () => SignUp$1,
	UNSAFE_PortalProvider: () => UNSAFE_PortalProvider,
	UserProfile: () => UserProfile$1,
	getToken: () => getToken
});
__reExport(dist_exports, client_exports);
setErrorThrowerOptions({ packageName: "@clerk/tanstack-react-start" });
//#endregion
//#region src/components/Sidebar.tsx
function Sidebar({ mobileOpen = false, onMobileClose }) {
	const [collapsed, setCollapsed] = React.useState(false);
	const [openSections, setOpenSections] = React.useState(() => new Set(["project-controls"]));
	const toggleSection = (id) => {
		setOpenSections((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};
	const { projectId } = useSelectedProject();
	const { data: allowedL1Codes } = useQuery({
		...allowedCbsL1CodesQueryOptions(projectId ?? 0),
		enabled: projectId !== null
	});
	const visibleDisciplines = React.useMemo(() => {
		if (projectId === null) return disciplines.filter((d) => d.id === "setup");
		const allowed = new Set(allowedL1Codes ?? []);
		return disciplines.filter((d) => {
			if (!d.l1Codes) return true;
			return d.l1Codes.some((code) => allowed.has(code));
		});
	}, [projectId, allowedL1Codes]);
	return /* @__PURE__ */ jsxs(Fragment, { children: [mobileOpen && /* @__PURE__ */ jsx("div", {
		className: "fixed inset-0 top-16 bg-black/40 z-20 md:hidden",
		onClick: onMobileClose,
		"aria-hidden": "true"
	}), /* @__PURE__ */ jsxs("aside", {
		className: `flex flex-col bg-white border-r border-slate-200 shrink-0 fixed md:static top-16 md:top-auto bottom-0 md:bottom-auto left-0 z-30 md:z-auto w-60 ${collapsed ? "md:w-14" : "md:w-60"} ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"} transition-transform md:transition-all duration-200 ease-in-out`,
		children: [
			/* @__PURE__ */ jsx("button", {
				onClick: () => setCollapsed((c) => !c),
				title: collapsed ? "Expand sidebar" : "Collapse sidebar",
				className: "absolute -right-3 top-5 z-10 hidden md:flex h-6 w-6 items-center justify-center rounded-full bg-white border border-slate-200 shadow-sm text-slate-400 hover:text-slate-700 transition-colors",
				children: collapsed ? /* @__PURE__ */ jsx(PanelLeftOpen, { size: 12 }) : /* @__PURE__ */ jsx(PanelLeftClose, { size: 12 })
			}),
			/* @__PURE__ */ jsx("button", {
				onClick: onMobileClose,
				"aria-label": "Close sidebar",
				className: "absolute right-2 top-2 md:hidden flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors",
				children: /* @__PURE__ */ jsx(X, { size: 18 })
			}),
			/* @__PURE__ */ jsx("nav", {
				className: "flex-1 overflow-y-auto py-3",
				children: visibleDisciplines.map((discipline) => {
					const Icon = discipline.icon;
					const isOpen = openSections.has(discipline.id);
					const navClassName = `w-full flex items-center gap-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors ${collapsed ? "md:justify-center md:px-0 px-4" : "px-4"}`;
					return /* @__PURE__ */ jsxs("div", { children: [discipline.to && !discipline.items ? /* @__PURE__ */ jsxs(Link, {
						to: discipline.to,
						title: collapsed ? discipline.label : void 0,
						className: navClassName,
						onClick: onMobileClose,
						activeProps: { className: `${navClassName} bg-red-50 text-red-800 [&>svg]:text-red-700` },
						children: [/* @__PURE__ */ jsx(Icon, {
							size: 17,
							className: "shrink-0 text-slate-500"
						}), /* @__PURE__ */ jsx("span", {
							className: `flex-1 text-left ${collapsed ? "md:hidden" : ""}`,
							children: discipline.label
						})]
					}) : /* @__PURE__ */ jsxs("button", {
						onClick: () => toggleSection(discipline.id),
						title: collapsed ? discipline.label : void 0,
						className: navClassName,
						children: [
							/* @__PURE__ */ jsx(Icon, {
								size: 17,
								className: "shrink-0 text-slate-500"
							}),
							/* @__PURE__ */ jsx("span", {
								className: `flex-1 text-left ${collapsed ? "md:hidden" : ""}`,
								children: discipline.label
							}),
							discipline.items && /* @__PURE__ */ jsx("span", {
								className: collapsed ? "md:hidden" : "",
								children: isOpen ? /* @__PURE__ */ jsx(ChevronDown, {
									size: 13,
									className: "text-slate-400"
								}) : /* @__PURE__ */ jsx(ChevronRight, {
									size: 13,
									className: "text-slate-400"
								})
							})
						]
					}), isOpen && /* @__PURE__ */ jsx("div", {
						className: `ml-9 border-l border-slate-200 mb-1 ${collapsed ? "md:hidden" : ""}`,
						children: discipline.items?.map((item) => item.to ? /* @__PURE__ */ jsx(Link, {
							to: item.to,
							activeOptions: { exact: true },
							onClick: onMobileClose,
							className: "block pl-3 pr-2 py-1.5 text-sm rounded-r transition-colors",
							activeProps: { className: "text-red-800 bg-red-50 font-medium" },
							inactiveProps: { className: "text-slate-600 hover:bg-slate-100" },
							children: item.label
						}, item.label) : /* @__PURE__ */ jsx("span", {
							className: "block pl-3 pr-2 py-1.5 text-sm text-slate-400 cursor-default select-none",
							children: item.label
						}, item.label))
					})] }, discipline.id);
				})
			})
		]
	})] });
}
//#endregion
//#region src/routes/__root.tsx
var Route$6 = createRootRouteWithContext()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1"
			},
			...seo({
				title: "TanStack Start | Type-Safe, Client-First, Full-Stack React Framework",
				description: `TanStack Start is a type-safe, client-first, full-stack React framework. `
			})
		],
		links: [
			{
				rel: "stylesheet",
				href: app_default
			},
			{
				rel: "apple-touch-icon",
				sizes: "180x180",
				href: "/apple-touch-icon.png"
			},
			{
				rel: "icon",
				type: "image/png",
				sizes: "32x32",
				href: "/favicon-32x32.png"
			},
			{
				rel: "icon",
				type: "image/png",
				sizes: "16x16",
				href: "/favicon-16x16.png"
			},
			{
				rel: "manifest",
				href: "/site.webmanifest",
				color: "#fffff"
			},
			{
				rel: "icon",
				href: "/favicon.ico"
			}
		]
	}),
	errorComponent: (props) => {
		return /* @__PURE__ */ jsx(RootDocument, { children: /* @__PURE__ */ jsx(DefaultCatchBoundary, { ...props }) });
	},
	notFoundComponent: () => /* @__PURE__ */ jsx(NotFound, {}),
	component: RootComponent
});
function RootComponent() {
	return /* @__PURE__ */ jsx(RootDocument, { children: /* @__PURE__ */ jsx(Outlet, {}) });
}
function RootDocument({ children }) {
	return /* @__PURE__ */ jsxs("html", { children: [/* @__PURE__ */ jsx("head", { children: /* @__PURE__ */ jsx(HeadContent, {}) }), /* @__PURE__ */ jsx("body", {
		className: "bg-slate-50 text-slate-900 antialiased",
		children: /* @__PURE__ */ jsxs(ClerkProvider, {
			publishableKey: "pk_test_ZnJlZS1odXNreS01Ni5jbGVyay5hY2NvdW50cy5kZXYk",
			children: [
				/* @__PURE__ */ jsx(dist_exports.Show, {
					when: "signed-out",
					children: /* @__PURE__ */ jsxs("div", {
						className: "min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-8",
						children: [/* @__PURE__ */ jsxs("div", {
							className: "flex flex-col items-center gap-3",
							children: [
								/* @__PURE__ */ jsx("img", {
									src: "/logo.png",
									alt: "Company Logo",
									className: "h-16 w-auto"
								}),
								/* @__PURE__ */ jsx("h1", {
									className: "text-2xl font-bold text-slate-800",
									children: "EPC Manager"
								}),
								/* @__PURE__ */ jsx("p", {
									className: "text-sm text-slate-500",
									children: "Project Controls Platform"
								})
							]
						}), /* @__PURE__ */ jsx(SignIn$1, {})]
					})
				}),
				/* @__PURE__ */ jsx(dist_exports.Show, {
					when: "signed-in",
					children: /* @__PURE__ */ jsx(SelectedProjectProvider, { children: /* @__PURE__ */ jsx(SignedInLayout, { children }) })
				}),
				/* @__PURE__ */ jsx(Scripts, {})
			]
		})
	})] });
}
function SignedInLayout({ children }) {
	const [mobileSidebarOpen, setMobileSidebarOpen] = React$1.useState(false);
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	React$1.useEffect(() => {
		setMobileSidebarOpen(false);
	}, [pathname]);
	const closeSidebar = React$1.useCallback(() => setMobileSidebarOpen(false), []);
	return /* @__PURE__ */ jsxs(Fragment, { children: [
		/* @__PURE__ */ jsxs("div", {
			className: "min-h-screen flex flex-col",
			children: [/* @__PURE__ */ jsx("header", {
				className: "bg-white border-b border-slate-200 shadow-sm z-40 relative",
				children: /* @__PURE__ */ jsxs("div", {
					className: "px-3 md:px-6 h-16 flex items-center gap-2 md:gap-6",
					children: [
						/* @__PURE__ */ jsx("button", {
							onClick: () => setMobileSidebarOpen(true),
							"aria-label": "Open sidebar",
							className: "md:hidden flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors",
							children: /* @__PURE__ */ jsx(Menu, { size: 20 })
						}),
						/* @__PURE__ */ jsxs("div", {
							className: "flex items-center gap-2 md:gap-3 shrink-0",
							children: [/* @__PURE__ */ jsx("img", {
								src: "/logo.png",
								alt: "Company Logo",
								className: "h-8 md:h-9 w-auto"
							}), /* @__PURE__ */ jsxs("div", {
								className: "hidden sm:flex flex-col leading-tight",
								children: [/* @__PURE__ */ jsx("span", {
									className: "font-bold text-slate-800 text-base",
									children: "Haskell"
								}), /* @__PURE__ */ jsx("span", {
									className: "text-xs text-slate-400",
									children: "Project Controls Platform"
								})]
							})]
						}),
						/* @__PURE__ */ jsx("div", {
							className: "hidden sm:block shrink-0",
							children: /* @__PURE__ */ jsx(ProjectSelect, {
								placeholder: "Select project…",
								className: "h-9 min-w-50"
							})
						}),
						/* @__PURE__ */ jsxs("nav", {
							className: "hidden sm:flex items-center gap-1 flex-1",
							children: [/* @__PURE__ */ jsx(Link, {
								to: "/",
								className: "px-3 md:px-4 py-2 rounded-md text-sm font-medium transition-colors",
								activeProps: { className: "text-red-800 bg-red-50" },
								inactiveProps: { className: "text-slate-600 hover:text-slate-900 hover:bg-slate-100" },
								activeOptions: { exact: true },
								children: "Change Log"
							}), /* @__PURE__ */ jsx(Link, {
								to: "/setup",
								className: "px-3 md:px-4 py-2 rounded-md text-sm font-medium transition-colors",
								activeProps: { className: "text-red-800 bg-red-50" },
								inactiveProps: { className: "text-slate-600 hover:text-slate-900 hover:bg-slate-100" },
								activeOptions: { exact: true },
								children: "Field Estimate Form"
							})]
						}),
						/* @__PURE__ */ jsxs("div", {
							className: "shrink-0 flex items-center gap-2 md:gap-3 ml-auto sm:ml-0",
							children: [/* @__PURE__ */ jsx(dist_exports.UserButton, {}), /* @__PURE__ */ jsx("div", {
								className: "hidden sm:block",
								children: /* @__PURE__ */ jsx(dist_exports.SignOutButton, {})
							})]
						})
					]
				})
			}), /* @__PURE__ */ jsxs("div", {
				className: "flex flex-1 overflow-hidden relative",
				children: [/* @__PURE__ */ jsx(Sidebar, {
					mobileOpen: mobileSidebarOpen,
					onMobileClose: closeSidebar
				}), /* @__PURE__ */ jsx("main", {
					className: "flex-1 overflow-auto bg-slate-50",
					children
				})]
			})]
		}),
		/* @__PURE__ */ jsx(TanStackRouterDevtools, { position: "bottom-right" }),
		/* @__PURE__ */ jsx(ReactQueryDevtools, { buttonPosition: "bottom-left" })
	] });
}
//#endregion
//#region src/routes/validation.tsx
var $$splitComponentImporter$2 = () => import("./validation-ZaLrgIok.js");
var Route$5 = createFileRoute("/validation")({ component: lazyRouteComponent($$splitComponentImporter$2, "component") });
//#endregion
//#region src/routes/summary.tsx
var $$splitComponentImporter$1 = () => import("./summary-CqYQUYFr.js");
var Route$4 = createFileRoute("/summary")({ component: lazyRouteComponent($$splitComponentImporter$1, "component") });
//#endregion
//#region src/routes/basis.tsx
var $$splitComponentImporter = () => import("./basis-2jlYqYid.js");
var Route$3 = createFileRoute("/basis")({ component: lazyRouteComponent($$splitComponentImporter, "component") });
//#endregion
//#region src/routes/api/users.ts
var Route$2 = createFileRoute("/api/users")({ server: { handlers: { GET: async ({ request }) => {
	console.info("Fetching users... @", request.url);
	const list = (await axios.get("https://jsonplaceholder.typicode.com/users")).data.slice(0, 10);
	return Response.json(list.map((u) => ({
		id: u.id,
		name: u.name,
		email: u.email
	})));
} } } });
//#endregion
//#region src/routes/api/posts.ts
var Route$1 = createFileRoute("/api/posts")({ server: { handlers: { POST: async ({ request }) => {
	const body = await request.json();
	console.info("POSTING POST... @", body);
	return Response.json([]);
} } } });
//#endregion
//#region src/routes/api/users.$id.ts
var Route = createFileRoute("/api/users/$id")({ server: { handlers: { GET: async ({ request, params }) => {
	console.info(`Fetching users by id=${params.id}... @`, request.url);
	try {
		const res = await axios.get("https://jsonplaceholder.typicode.com/users/" + params.id);
		return Response.json({
			id: res.data.id,
			name: res.data.name,
			email: res.data.email
		});
	} catch (e) {
		console.error(e);
		return Response.json({ error: "User not found" }, { status: 404 });
	}
} } } });
//#endregion
//#region src/routeTree.gen.ts
var ValidationRoute = Route$5.update({
	id: "/validation",
	path: "/validation",
	getParentRoute: () => Route$6
});
var SummaryRoute = Route$4.update({
	id: "/summary",
	path: "/summary",
	getParentRoute: () => Route$6
});
var SetupRoute = Route$7.update({
	id: "/setup",
	path: "/setup",
	getParentRoute: () => Route$6
});
var PipingRoute = Route$8.update({
	id: "/piping",
	path: "/piping",
	getParentRoute: () => Route$6
});
var MaterialsRoute = Route$9.update({
	id: "/materials",
	path: "/materials",
	getParentRoute: () => Route$6
});
var BasisRoute = Route$3.update({
	id: "/basis",
	path: "/basis",
	getParentRoute: () => Route$6
});
var DisciplineRoute = Route$10.update({
	id: "/$discipline",
	path: "/$discipline",
	getParentRoute: () => Route$6
});
var IndexRoute = Route$11.update({
	id: "/",
	path: "/",
	getParentRoute: () => Route$6
});
var ApiUsersRoute = Route$2.update({
	id: "/api/users",
	path: "/api/users",
	getParentRoute: () => Route$6
});
var ApiPostsRoute = Route$1.update({
	id: "/api/posts",
	path: "/api/posts",
	getParentRoute: () => Route$6
});
var ApiUsersRouteChildren = { ApiUsersIdRoute: Route.update({
	id: "/$id",
	path: "/$id",
	getParentRoute: () => ApiUsersRoute
}) };
var rootRouteChildren = {
	IndexRoute,
	DisciplineRoute,
	BasisRoute,
	MaterialsRoute,
	PipingRoute,
	SetupRoute,
	SummaryRoute,
	ValidationRoute,
	ApiPostsRoute,
	ApiUsersRoute: ApiUsersRoute._addFileChildren(ApiUsersRouteChildren)
};
var routeTree = Route$6._addFileChildren(rootRouteChildren)._addFileTypes();
//#endregion
//#region src/router.tsx
function getRouter() {
	const queryClient = new QueryClient();
	const router = createRouter({
		routeTree,
		context: { queryClient },
		defaultPreload: false,
		defaultErrorComponent: DefaultCatchBoundary,
		defaultNotFoundComponent: () => /* @__PURE__ */ jsx(NotFound, {})
	});
	setupRouterSsrQueryIntegration({
		router,
		queryClient
	});
	return router;
}
//#endregion
export { getRouter };
