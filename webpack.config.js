const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const { version } = require("./package.json");

const isFirefox = process.env.BROWSER === "firefox";
const isProd = process.env.NODE_ENV === "production";

module.exports = {
  mode: isProd ? "production" : "development",
  devtool: isProd ? false : "cheap-module-source-map",
  entry: {
    content: "./src/js/content.js",
    background: "./src/js/background.js",
    receipt: "./src/js/receipt.js",
  },
  output: {
    path: path.join(__dirname, isFirefox ? "build-firefox" : "build"),
    filename: "[name].bundle.js",
    clean: true,
  },
  module: {
    rules: [
      {
        // Overlay CSS is imported as a string and injected into the shadow root
        test: /\.css$/,
        use: [
          {
            loader: "css-loader",
            options: { exportType: "string", url: false },
          },
        ],
      },
    ],
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: isFirefox ? "src/manifest.firefox.json" : "src/manifest.json",
          to: "manifest.json",
          // package.json is the single source of truth for the version
          transform: (content) =>
            JSON.stringify(
              { ...JSON.parse(content.toString()), version },
              null,
              2,
            ),
        },
        { from: "src/img/icon-128.png" },
        { from: "src/img/icon-34.png" },
        { from: "src/fonts/*.woff2", to: "fonts/[name][ext]" },
        { from: "src/receipt.html" },
        { from: "src/receipt.css" },
      ],
    }),
  ],
};
