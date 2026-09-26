import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()

const source = path.join(
	root,
	'node_modules',
	'bgutil-ytdlp-pot-provider',
	'build'
)

const target = path.join(
	root,
	'.vercel',
	'output',
	'functions',
	'__fallback.func',
	'node_modules',
	'bgutil-ytdlp-pot-provider',
	'build'
)

await fs.cp(
	source,
	target,
	{
		recursive: true,
		force: true,
	}
)

const packageSource = path.join(
	root,
	'node_modules',
	'bgutil-ytdlp-pot-provider',
	'package.json'
)

const packageTarget = path.join(
	root,
	'.vercel',
	'output',
	'functions',
	'__fallback.func',
	'node_modules',
	'bgutil-ytdlp-pot-provider',
	'package.json'
)

await fs.copyFile(
	packageSource,
	packageTarget
)

const pluginSource = path.join(
	root,
	'bgutil-ytdlp-pot-provider',
	'plugin'
)

const pluginTarget = path.join(
	root,
	'.vercel',
	'output',
	'functions',
	'__fallback.func',
	'node_modules',
	'bgutil-ytdlp-pot-provider',
	'plugin'
)

await fs.cp(
	pluginSource,
	pluginTarget,
	{
		recursive: true,
		force: true,
	}
)

console.log(
	'[BGUTIL COPY] plugin copied to:',
	pluginTarget
)

console.log(
	'[BGUTIL COPY] copied to:',
	target
)
