import path from 'path'
import Promise from 'bluebird'
import gulp from 'gulp'
import del from 'del'
import webpack from 'webpack'
import gulpWebpack from 'webpack-stream'
import gulpPlumber from 'gulp-plumber'
import gulpDebug from 'gulp-debug'
import LiveReload from 'webpack-livereload-plugin'
import { merge, clone, typeOf } from 'lutils'

import baseWebpackConfig from './webpack.config'

/**
 *  Build class.
 *  Handles pathing, livereload and gulp webpack configuration.
 */
export default class Build {
    constructor(config = {}) {
        this.config = merge({
            source  : path.resolve(__dirname, '../'),
            dist    : path.resolve(__dirname, '../dist'),

            resolve : '', // Prepended to resolved urls, eg. {/customPrefixUrlHere/}662d7d.jpg

            webpack : clone(baseWebpackConfig),
        }, config )
    }

    /**
     *  This builds up a webpack config based on:
     *  - `./webpack.config.js`
     *  - `this.config.webpack`, specified on construction
     *  - `o`, options, dictating whether to:
     *  	- Watch for changes
     *  	- Compress
     *  	- LiveReload
     *
     *  Paths are resolved based on `this.config`, it is then piped through to gulp,
     *  which handles errors, live reload, etc.
     *
     *  @param   {Object}   o - options
     *  @return  {Promise}
     */
    webpack(o = {}) {
        o.babel   = o.babel || {}
        o.webpack = merge(
            clone(this.config.webpack),
            o.webpack || {}
        )

        if ( o.compress )
            o.webpack.plugins.push(
                ...[
                    new webpack.optimize.DedupePlugin(),
                    new webpack.optimize.UglifyJsPlugin({
                        compress: {
                            unused        : true,
                            dead_code     : true,
                            warnings      : false,
                            drop_debugger : true,
                            screw_ie8     : true,
                        }
                    }),
                ]
            )

        if ( o.liveReload )
            o.webpack.plugins.push( new LiveReload(o.liveReload || null) )

        const config = {
            ...o.webpack,

            watch: o.watch,

            entry: [
                ...this.config.webpack.entry,
                o.source
            ],

            devtool: o.compress
                ? false
                : o.webpack.devtool,

            module: {
                ...o.webpack.module,

                loaders: [
                    {
                        test    : /\.jsx?$/i,
                        exclude : /node_modules/,
                        loader  : 'babel-loader',
                        query   : o.babel
                    },
                    ...(o.webpack.module.loaders || [])
                ]
            },

            output: {
                filename          : path.basename(o.source),
                sourceMapFilename : `${path.basename(o.source)}.map`,
                publicPath        : o.resolve || this.config.resolve,
                pathinfo          : ! o.compress
            },
        }

        // Pipe it through gulp
        return new Promise((resolve, reject) => {
            function done(err) {
                if ( err instanceof Error ) return reject(err)
                return resolve(g)
            }

            let g = gulp.src(o.source)
                .pipe( gulpPlumber() )
                .pipe( gulpDebug({ title: 'webpack' }) )
                .pipe( gulpWebpack(config, webpack, o.watch ? done : null) )
                .pipe( gulp.dest(o.dist) )

            if ( ! o.watch )
                g = g.on('end', done)

            return g
        })
    }

    /**
     *  Builds based on an array scripts
     *
     *  @param   {Object}  overrides
     *  @return  {Promise}
     */
    build(overrides) {
        if ( ! typeOf.Array(this.config.scripts) ) return []

        return Promise.map(this.config.scripts, (options) =>
            this.webpack({
                ...merge(options, overrides),
                source   : path.resolve(this.config.source, options.source || ''),
                dist     : path.resolve(this.config.dist, options.dist || ''),
                watch    : options.watch,
            })
        )
    }

    /**
     *  Purges dist folder
     */
    clean() {
        return del( path.join(this.config.dist, './*') )
    }

}
