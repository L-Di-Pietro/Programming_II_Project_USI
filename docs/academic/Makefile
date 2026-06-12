# Makefile for the QuantEdge academic PDF (iCorsi submission).
# Usage:
#   make pdf      # build QuantEdge_Project_Documentation.pdf with latexmk (pdflatex + biber)
#   make watch    # rebuild on every change (latexmk -pvc)
#   make clean    # remove aux files (keep QuantEdge_Project_Documentation.pdf)
#   make distclean# remove everything including QuantEdge_Project_Documentation.pdf
#
# Prereqs: TeX Live or MacTeX with `latexmk`, `pdflatex`, `biber`,
# and the LaTeX packages used by QuantEdge_Project_Documentation.tex (biblatex, todonotes, csquotes,
# microtype, booktabs, listings, hyperref, geometry, lmodern, amsmath, amssymb).
# On a fresh TeX Live: `tlmgr install biblatex biber todonotes csquotes`.

MAIN = QuantEdge_Project_Documentation
LATEXMK_FLAGS = -pdf -interaction=nonstopmode -halt-on-error -file-line-error

.PHONY: pdf watch clean distclean

pdf:
	latexmk $(LATEXMK_FLAGS) $(MAIN).tex

watch:
	latexmk $(LATEXMK_FLAGS) -pvc $(MAIN).tex

clean:
	latexmk -c $(MAIN).tex
	rm -f $(MAIN).bbl $(MAIN).run.xml

distclean:
	latexmk -C $(MAIN).tex
	rm -f $(MAIN).bbl $(MAIN).run.xml $(MAIN).pdf
