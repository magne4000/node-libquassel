'use strict';

module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    exec: {
      lts: {
          cwd: './node_modules/tls-browserify/node_modules/node-forge',
          cmd: 'npm install && npm run minify'
      },
      stable: {
          cwd: './node_modules/node-forge',
          cmd: 'npm install && npm run minify'
      }
    },
    jsdoc: {
      dist: {
        src: ['lib/*.js', 'package.json', 'README.md'],
        dest: 'doc',
        options: {
            template: 'node_modules/minami',
            configure: 'jsdoc.conf.json'
        }
      }
    },
    browserify: {
      dev: {
        src: ['client/iefix.js', './node_modules/es6-map/implement.js'],
        dest: 'client/libquassel.js',
        options: {
          alias: [
            './lib/libquassel.js:quassel',
            './lib/network.js:network',
            './lib/identity.js:identity',
            './node_modules/extend/index.js:extend',
            './lib/user.js:user',
            './lib/buffer.js:ircbuffer',
            './lib/message:message',
            './lib/ignore:ignore',
            './node_modules/net-browserify-alt/browser.js:net',
            './node_modules/tls-browserify/index.js:tls',
            './node_modules/debug/browser.js:debug'
          ]
        }
      },
      dist: {
        src: ['client/iefix.js', './node_modules/es6-map/implement.js'],
        dest: 'client/libquassel.min.js',
        options: {
          alias: [
            './lib/libquassel.js:quassel',
            './lib/network.js:network',
            './lib/identity.js:identity',
            './node_modules/extend/index.js:extend',
            './lib/user.js:user',
            './lib/buffer.js:ircbuffer',
            './lib/message:message',
            './lib/ignore:ignore',
            './node_modules/net-browserify-alt/browser.js:net',
            './node_modules/tls-browserify/index.js:tls',
            './node_modules/debug/browser.js:debug'
          ],
          transform: [['uglifyify', {
              global: true,
              ignore: ['**/node_modules/node-forge/*', '**/node_modules/es6-map/*'],
              compress: {
                keep_fnames: true
              },
          }]]
        }
      }
    },
    watch: {
      dist: {
        files: 'lib/*.js',
        tasks: ['browserify:dev']
      }
    },
  });

  // These plugins provide necessary tasks.
  grunt.loadNpmTasks('grunt-exec');
  grunt.loadNpmTasks('grunt-browserify');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-jsdoc');

  grunt.registerTask('stable', ['exec:stable', 'browserify:dev', 'browserify:dist', 'jsdoc']);
  grunt.registerTask('lts', ['exec:lts', 'browserify:dev', 'browserify:dist', 'jsdoc']);
  
  grunt.registerTask('doc', ['jsdoc']);

};
