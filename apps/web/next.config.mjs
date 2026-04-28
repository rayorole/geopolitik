/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	transpilePackages: ["@geopolitik/shared", "@geopolitik/config"],
	experimental: {
		typedRoutes: false,
	},
};

export default nextConfig;
