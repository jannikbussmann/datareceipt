const webpack = require("webpack");
const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");

const browser = process.env.BROWSER || "chrome";
const isFirefox = browser === "firefox";
const outDir = isFirefox ? "build-firefox" : "build";
const manifestSrc = isFirefox
  ? "src/manifest.firefox.json"
  : "src/manifest.json";

const isProd = process.env.NODE_ENV === "production";

module.exports = {
  mode: isProd ? "production" : "development",
  devtool: isProd ? false : "cheap-module-source-map",
  optimization: {
    splitChunks: false,
  },
  // Disable async chunk splitting — content scripts can't dynamically load
  // extension chunks from a web page context without complex publicPath setup.
  entry: {
    content: path.join(__dirname, "src", "js", "content.js"),
    background: path.join(__dirname, "src", "js", "background.js"),
  },
  output: {
    path: path.join(__dirname, outDir),
    filename: "[name].bundle.js",
    clean: true,
    asyncChunks: false,
  },
  resolve: {
    modules: [path.join(__dirname, "node_modules"), "node_modules"],
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        use: "babel-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        oneOf: [
          {
            // `?inline` → CSS as string, injected into the overlay's shadow root
            resourceQuery: /inline/,
            use: [{ loader: "css-loader", options: { exportType: "string" } }],
          },
          { use: ["style-loader", "css-loader"] },
        ],
      },
      {
        test: /\.(png|gif|jpg)$/,
        type: "asset/resource",
        generator: { filename: "[name][ext]" },
      },
      {
        // Fonts are inlined as base64 data URIs so that @font-face rules in
        // the injected content script CSS resolve correctly regardless of the
        // host page's URL.
        test: /\.(eot|otf|svg|ttf|woff|woff2)$/,
        type: "asset/inline",
      },
    ],
  },
  plugins: [
    new webpack.EnvironmentPlugin({ NODE_ENV: isProd ? "production" : "development" }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: manifestSrc,
          to: "manifest.json",
          transform(content) {
            return Buffer.from(
              JSON.stringify({
                description: process.env.npm_package_description,
                version: process.env.npm_package_version,
                ...JSON.parse(content.toString()),
              })
            );
          },
        },
        { from: "src/img/icon-128.png", to: "icon-128.png" },
        { from: "src/img/icon-34.png", to: "icon-34.png" },
      ],
    }),
  ],
};
