"use client";

// Accessible toasts via sonner. Apps render <Toaster /> once (in the root layout) and call
// toast()/toast.success()/toast.error() from anywhere.
export { Toaster, toast } from "sonner";
