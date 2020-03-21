![CI Build](https://travis-ci.org/vdtn359/ts-transpile.svg?branch=master) ![Version Badge](https://badge.fury.io/js/ts-transpile.svg)
# ts-transpile

> Compile typescript files without type checking

## Overview
- A Typescript compiler that skips typechecking but still fails on syntax errors. It will perform the compilation quickly and consume less resource than `tsc`.

## Features

- Incremental compilation
- Project references
- File watching
- Support most typescript command line options

## Install

```
$ npm install -g ts-transpile
```

## Usage

```js
ts-transpile [-p project] [-b build] [-w] [options]
```
