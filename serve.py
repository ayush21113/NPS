#!/usr/bin/env python3
"""Threaded HTTP server with no-cache headers for development."""
import http.server
import socketserver
import os

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

os.chdir('/Users/harshitagarwal/Desktop/nps/frontend')
server = ThreadedHTTPServer(('', 8080), NoCacheHandler)
print("Serving on http://localhost:8080 (threaded, no-cache)")
server.serve_forever()
