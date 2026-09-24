"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, FileText, Download, Eye } from "lucide-react";
import type { Book } from "@cipansor/shared";
import { authFileUrl } from "@/lib/files";

interface DigitalLibraryViewerProps {
  books: Book[];
}

/**
 * Grid of digital books/kitab. Expects an already server-filtered
 * `isDigital` collection; the search box narrows client-side by
 * title/author for quick lookup within the loaded page.
 */
export function DigitalLibraryViewer({ books }: DigitalLibraryViewerProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredBooks = books.filter(
    (book) =>
      book.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      book.author.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          placeholder="Cari kitab atau e-book..."
          className="pl-10"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBooks.map((book) => (
          <Card
            key={book.id}
            className="overflow-hidden group hover:border-primary transition-colors"
          >
            <div className="aspect-[3/4] bg-muted relative overflow-hidden">
              {book.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={book.coverUrl}
                  alt={book.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
                  <FileText className="w-12 h-12 mb-2 opacity-20" />
                  <span className="text-xs font-medium">{book.title}</span>
                </div>
              )}
              {book.fileUrl && (
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      window.open(authFileUrl(book.fileUrl), "_blank")
                    }
                  >
                    <Eye className="w-4 h-4 mr-2" /> Baca
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      window.open(authFileUrl(book.fileUrl), "_blank")
                    }
                    title="Unduh"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
            <CardHeader className="p-4">
              <div className="flex justify-between items-start mb-1">
                <Badge variant="outline" className="text-[10px] uppercase">
                  {book.category?.name ?? "Tanpa kategori"}
                </Badge>
                <Badge className="text-[10px] bg-blue-600 text-white uppercase">
                  {book.fileType || "digital"}
                </Badge>
              </div>
              <CardTitle className="text-sm line-clamp-2 mb-1">
                {book.title}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{book.author}</p>
            </CardHeader>
          </Card>
        ))}

        {filteredBooks.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-10" />
            <p>Belum ada koleksi digital yang cocok.</p>
          </div>
        )}
      </div>
    </div>
  );
}
