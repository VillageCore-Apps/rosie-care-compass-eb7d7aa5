import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogOverlay
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const FirstLaunchModal = () => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const hasAgreed = localStorage.getItem("termsAgreed");
  useEffect(() => {
    const isOnPolicyPage =
      location.pathname === '/privacy-policy' ||
      location.pathname === '/terms-of-service' ||
      location.pathname === '/acceptable-use-policy';
    console.log("hasAgreed =", hasAgreed);
    console.log("location.pathname =", location.pathname);
    console.log("isOnPolicyPage =", isOnPolicyPage);
    if (!hasAgreed && !isOnPolicyPage) {
      setIsOpen(true);
    }
  }, [location]);

  useEffect(() => {
    if (hasAgreed === "true") {
      setIsOpen(false);
    }
  }, [hasAgreed]);


  const handleAgree = () => {
    localStorage.setItem("termsAgreed", "true");
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => { }}>
      <DialogContent className="max-w-[340px] lg:max-w-[400px] rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-center text-lg font-semibold">
            Welcome to Our App
          </DialogTitle>
        </DialogHeader>
        <div className="py-4 text-center">
          <p className="text-base text-muted-foreground leading-relaxed">
            By using this app, you agree to our{" "}
            <Link
              to="/privacy-policy"
              className="text-primary hover:underline"
              onClick={() => setIsOpen(false)}
            >
              Privacy Policy
            </Link>
            ,{" "}
            <Link
              to="/terms-of-service"
              className="text-primary hover:underline"
              onClick={() => setIsOpen(false)}
            >
              Terms of Service
            </Link>
            , and{" "}
            <Link
              to="/acceptable-use-policy"
              className="text-primary hover:underline"
              onClick={() => setIsOpen(false)}
            >
              Acceptable Use Policy
            </Link>
            .
          </p>
        </div>

        <DialogFooter className="flex justify-center">
          <Button onClick={handleAgree} className="w-full">
            Agree & Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FirstLaunchModal;